import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Flame, Award, Lock } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/api/auth';
import type { PublicProfile } from '@/lib/api/types';
import { levelProgress, BADGES } from '@/lib/gamification';
import { Logo } from '@/components/Logo';

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
    if (!auth) return; // logged-out: δείχνουμε sign-in prompt παρακάτω
    let cancelled = false;
    setState({ kind: 'loading' });
    api
      .socialPublicProfile(username)
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
      <Link to="/achievements" className="text-xs text-muted-foreground hover:text-foreground">
        ← {t('gami.title')}
      </Link>

      {!auth ? (
        <Shell>
          <p className="text-sm text-muted-foreground">{t('social.signInPrompt')}</p>
        </Shell>
      ) : state.kind === 'loading' ? (
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
        <ProfileView profile={state.profile} />
      )}
    </div>
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
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
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
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
