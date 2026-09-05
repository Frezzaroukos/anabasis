/**
 * Social data hook — φιλίες, αιτήματα, leaderboard, δημόσιο προφίλ.
 *
 * Τα social δεδομένα ζουν στον SERVER (όχι στο IndexedDB — ένα friendship
 * συνδέει δύο accounts, δεν χωράει στο per-account LWW sync). Άρα: fetch
 * κατευθείαν από /api/social, offline → graceful disable (καμία ουρά writes).
 *
 * Publish snapshot: με το που ανοίγει η ενότητα (logged-in), στέλνουμε το
 * aggregate («XP/streaks/badges») ώστε το προφίλ μας στο leaderboard των φίλων
 * να είναι φρέσκο. Ο server ξαναϋπολογίζει level/tier — εδώ στέλνουμε μόνο ό,τι
 * είναι client-authoritative.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api/client';
import type { SocialMe, FriendRow, LeaderboardRow } from '@/lib/api/types';
import {
  totalXp,
  badgeStates,
  type GamificationInput,
} from '@/lib/gamification';

export type LeaderboardScope = 'friends' | 'global';

export interface SocialState {
  loading: boolean;
  /** Ο server δεν απαντά (offline / down) — δείξε ήπιο μήνυμα, όχι σφάλμα. */
  offline: boolean;
  me: SocialMe | null;
  friends: FriendRow[];
  requests: FriendRow[];
  leaderboard: LeaderboardRow[];
  scope: LeaderboardScope;
}

/** Το snapshot που είναι client-authoritative (ο server clamp-άρει/παράγει level). */
export function statsBodyFromInput(data: GamificationInput) {
  return {
    xp: totalXp(data),
    streak_days: data.streakDays,
    longest_streak_days: data.longestStreakDays,
    badges: badgeStates(data)
      .filter((b) => b.isEarned)
      .map((b) => b.id),
  };
}

export interface SocialActions {
  setScope: (scope: LeaderboardScope) => void;
  reload: () => Promise<void>;
  addFriend: (username: string) => Promise<{ ok: boolean; error?: string }>;
  accept: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  updateProfile: (patch: {
    username?: string;
    display_name?: string;
    share_profile?: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * @param enabled  μόνο όταν ο χρήστης είναι συνδεδεμένος (αλλιώς no-op).
 * @param input    το gamification input για publish (ή null όσο φορτώνει).
 */
export function useSocial(
  enabled: boolean,
  input: GamificationInput | null,
): [SocialState, SocialActions] {
  const [state, setState] = useState<SocialState>({
    loading: enabled,
    offline: false,
    me: null,
    friends: [],
    requests: [],
    leaderboard: [],
    scope: 'friends',
  });

  const loadAll = useCallback(
    async (scope: LeaderboardScope) => {
      if (!enabled) return;
      try {
        const [me, friends, requests, leaderboard] = await Promise.all([
          api.socialMe(),
          api.socialFriends(),
          api.socialRequests(),
          api.socialLeaderboard(scope),
        ]);
        setState((s) => ({
          ...s,
          loading: false,
          offline: false,
          me,
          friends,
          requests,
          leaderboard,
          scope,
        }));
      } catch (e) {
        // ApiError = server απάντησε (π.χ. 401)· network reject = offline.
        setState((s) => ({ ...s, loading: false, offline: !(e instanceof ApiError) }));
      }
    },
    [enabled],
  );

  // Publish snapshot (best-effort) + αρχικό load. Το publish δεν μπλοκάρει.
  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    let cancelled = false;
    (async () => {
      if (input) {
        try {
          await api.socialPublishStats(statsBodyFromInput(input));
        } catch {
          /* offline / not-critical — το load από κάτω θα δείξει την κατάσταση */
        }
      }
      if (!cancelled) await loadAll('friends');
    })();
    return () => {
      cancelled = true;
    };
    // input αλλάζει reference κάθε live-query· κλειδώνουμε στο ουσιαστικό xp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, input ? totalXp(input) : 0]);

  const setScope = useCallback(
    (scope: LeaderboardScope) => {
      setState((s) => ({ ...s, scope }));
      void loadAll(scope);
    },
    [loadAll],
  );

  const reload = useCallback(() => loadAll(state.scope), [loadAll, state.scope]);

  const addFriend = useCallback(
    async (username: string) => {
      try {
        await api.socialSendRequest(username.trim());
        await loadAll(state.scope);
        return { ok: true };
      } catch (e) {
        const code = e instanceof ApiError ? e.code : 'offline';
        return { ok: false, error: code };
      }
    },
    [loadAll, state.scope],
  );

  const accept = useCallback(
    async (id: string) => {
      await api.socialAccept(id);
      await loadAll(state.scope);
    },
    [loadAll, state.scope],
  );

  const remove = useCallback(
    async (id: string) => {
      await api.socialRemove(id);
      await loadAll(state.scope);
    },
    [loadAll, state.scope],
  );

  const updateProfile = useCallback(
    async (patch: { username?: string; display_name?: string; share_profile?: boolean }) => {
      try {
        const me = await api.socialUpdateProfile(patch);
        setState((s) => ({ ...s, me }));
        return { ok: true };
      } catch (e) {
        const code = e instanceof ApiError ? e.code : 'offline';
        return { ok: false, error: code };
      }
    },
    [],
  );

  return [state, { setScope, reload, addFriend, accept, remove, updateProfile }];
}
