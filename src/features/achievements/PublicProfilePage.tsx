import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Flame, Award, Lock, UserPlus, Check, Send, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/api/auth';
import type { FriendshipState, PublicProfile } from '@/lib/api/types';
import { levelProgress, BADGES } from '@/lib/gamification';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';

const RING_R = 52;
const RING_CIRC = 2 * Math.PI * RING_R;

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; profile: PublicProfile }
  | { kind: 'missing' } // ιδιωτικό ή δεν υπάρχει (uniform — καμία διαρροή)
  | { kind: 'offline' };

/**
 * Δημόσια προβολή προφίλ (`/u/:username`) — το «τέλος» του invite loop: πατάς το
 * @username ενός φίλου και βλέπεις την ανάβασή του (aggregate μόνο: level/tier/
 * badges/streaks). Ο server επιβάλλει το privacy στο SQL· εδώ απλά ζωγραφίζουμε.
 */
export function PublicProfilePage() {
  const { t } = useTranslation();
  const { username = '' } = useParams();
  const auth = useAuth();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    // Logged-in: friends μπορούν να δουν και ιδιωτικό προφίλ. Logged-out:
    // μόνο το public endpoint, δηλαδή μόνο ό,τι έχει share_profile=1.
    const request = auth
      ? api.socialPublicProfile(username)
      : api.socialPublicProfilePublic(username);
    request
      .then((profile) => {
        if (!cancelled) setState({ kind: 'ok', profile });
      })
      .catch((e) => {
        if (cancelled) return;
        setState(e instanceof ApiError ? { kind: 'missing' } : { kind: 'offline' });
      });
    return () => {
      cancelled = true;
    };
  }, [username, auth]);

  return (
    <div className="animate-rise-in space-y-6">
      <Link
        to={auth ? '/achievements' : '/'}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← {auth ? t('gami.title') : t('nav.home')}
      </Link>

      {state.kind === 'loading' ? (
        <Shell>
          <div className="mx-auto h-40 w-40 animate-pulse rounded-full bg-muted/40" />
        </Shell>
      ) : state.kind === 'offline' ? (
        <Shell>
          <p className="text-sm text-muted-foreground">{t('social.offline')}</p>
        </Shell>
      ) : state.kind === 'missing' ? (
        <Shell>
          <p className="text-sm text-muted-foreground">{t('social.profile.notFound')}</p>
        </Shell>
      ) : (
        <>
          <ProfileView profile={state.profile} />
          {auth ? (
            <ProfileActions
              profile={state.profile}
              onChange={(friendship) =>
                setState((current) =>
                  current.kind === 'ok'
                    ? { ...current, profile: { ...current.profile, friendship } }
                    : current,
                )
              }
            />
          ) : (
            <JoinCta />
          )}
        </>
      )}
    </div>
  );
}

function ProfileActions({
  profile,
  onChange,
}: {
  profile: PublicProfile;
  onChange: (friendship: FriendshipState) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const friendship = profile.friendship ?? null;
  const username = profile.username;
  const accountId = profile.account_id;

  const run = async (
    action: () => Promise<FriendshipState | void>,
    fallback: FriendshipState,
  ) => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const next = await action();
      onChange(next ?? fallback);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (friendship === 'self') {
    return (
      <div className="flex justify-center">
        <Button asChild variant="outline">
          <Link to="/community">{t('social.profile.manageProfile')}</Link>
        </Button>
      </div>
    );
  }

  if (friendship === 'friend') {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-[hsl(var(--gold))]" />
          {t('social.profile.friends')}
        </span>
        <Button asChild variant="ghost" size="sm">
          <Link to="/community">{t('social.profile.manageProfile')}</Link>
        </Button>
      </div>
    );
  }

  if (friendship === 'out') {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Send className="h-4 w-4" />
          {t('social.profile.requestSent')}
        </span>
        {accountId && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void run(() => api.socialRemove(accountId), null)}
          >
            <X className="h-4 w-4" />
            {t('social.profile.cancelRequest')}
          </Button>
        )}
        {error && <p className="text-xs text-destructive">{t('social.profile.actionError')}</p>}
      </div>
    );
  }

  if (friendship === 'in') {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          disabled={busy || !accountId}
          onClick={() => accountId && void run(() => api.socialAccept(accountId), 'friend')}
        >
          <Check className="h-4 w-4" />
          {t('social.profile.acceptRequest')}
        </Button>
        <Button
          variant="ghost"
          disabled={busy || !accountId}
          onClick={() => accountId && void run(() => api.socialRemove(accountId), null)}
        >
          <X className="h-4 w-4" />
          {t('social.profile.declineRequest')}
        </Button>
        {error && <p className="text-xs text-destructive">{t('social.profile.actionError')}</p>}
      </div>
    );
  }

  if (!username) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const res = await api.socialSendRequest(username);
            return res.status === 'accepted' ? 'friend' : 'out';
          }, 'out')
        }
      >
        <UserPlus className="h-4 w-4" />
        {t('social.profile.addFriend')}
      </Button>
      {error && <p className="text-xs text-destructive">{t('social.profile.actionError')}</p>}
    </div>
  );
}

function JoinCta() {
  const { t } = useTranslation();
  return (
    <section className="rounded-xl border border-[hsl(var(--gold)/0.25)] bg-card p-6 text-center">
      <p className="font-display text-lg font-semibold">{t('social.profile.publicCtaTitle')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t('social.profile.publicCtaBody')}</p>
      <Button asChild className="mt-4">
        <Link to="/settings/account">{t('social.profile.publicCtaButton')}</Link>
      </Button>
    </section>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <section className="rounded-xl bg-card p-8 text-center">{children}</section>;
}

function ProfileView({ profile }: { profile: PublicProfile }) {
  const { t } = useTranslation();
  const prog = levelProgress(profile.xp);
  const offset = RING_CIRC * (1 - prog.fraction);
  const name = profile.display_name || (profile.username ? `@${profile.username}` : t('social.anon'));

  let earned: string[] = [];
  try {
    const arr = JSON.parse(profile.badges);
    if (Array.isArray(arr)) earned = arr as string[];
  } catch {
    /* corrupt → καμία badge */
  }

  return (
    <>
      <section className="flex flex-col items-center rounded-xl bg-card p-6">
        <div className="relative h-40 w-40">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r={RING_R} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
            <circle
              cx="60"
              cy="60"
              r={RING_R}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={RING_CIRC}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-4xl font-semibold leading-none tabular-nums">
              {profile.level}
            </span>
            <span className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {t('gami.level')}
            </span>
          </div>
        </div>
        <p className="mt-4 truncate font-display text-lg font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {t(`gami.tier.${profile.tier}`)}
          {profile.altitude_m > 0 ? ` · ${profile.altitude_m.toLocaleString()} m` : ''}
          {` · ${profile.xp.toLocaleString()} XP`}
        </p>
        {(profile.streak_days > 0 || profile.longest_streak_days > 0) && (
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
            {profile.streak_days > 0 && (
              <span className="flex items-center gap-1 text-[hsl(var(--gold))]">
                <Flame className="h-3.5 w-3.5" />
                {t('social.profile.streak', { count: profile.streak_days })}
              </span>
            )}
            {profile.longest_streak_days > 0 && (
              <span>{t('social.profile.longestStreak', { count: profile.longest_streak_days })}</span>
            )}
          </div>
        )}
      </section>

      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t('gami.badges')}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {BADGES.map((b) => {
            const has = earned.includes(b.id);
            return (
              <div
                key={b.id}
                className={`flex flex-col items-center rounded-xl bg-card p-4 text-center ${
                  has ? '' : 'opacity-55'
                }`}
              >
                {has ? (
                  <Award className="h-9 w-9 text-[hsl(var(--gold))]" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-elevated text-muted-foreground">
                    <Lock className="h-4 w-4" />
                  </span>
                )}
                <span className="mt-2 text-sm font-medium">{t(b.nameKey)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex justify-center pt-1">
        <Logo className="h-5 w-5 text-muted-foreground/50" />
      </div>
    </>
  );
}
