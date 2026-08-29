import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Lock } from 'lucide-react';
import { getGamificationInput } from '@/lib/db/queries';
import { useCountUp } from '@/hooks/useCountUp';
import { Logo } from '@/components/Logo';
import {
  levelProgress,
  badgeStates,
  xpBreakdown,
  hasActivity,
  type GamificationInput,
} from '@/lib/gamification';

const RING_R = 52;
const RING_CIRC = 2 * Math.PI * RING_R;

/**
 * «Η ανάβασή σου» — XP, στάδιο (υψόμετρο), badges κορυφών. Καμία ψεύτικη
 * πρόοδος: σε φρέσκο προφίλ δείχνει προτροπή, όχι επίπεδο-1 spam.
 */
export function AchievementsPage() {
  const { t } = useTranslation();
  const data = useLiveQuery(() => getGamificationInput(), [], null);

  if (data === null) return null;

  if (!hasActivity(data)) {
    return (
      <div className="space-y-6">
        <Header t={t} />
        <section className="rounded-xl bg-card p-8 text-center">
          <Logo className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">{t('gami.emptyHint')}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header t={t} />
      <XpHero data={data} />
      <Badges data={data} />
      <Breakdown data={data} />
    </div>
  );
}

function Header({ t }: { t: ReturnType<typeof useTranslation>['t'] }) {
  return (
    <header>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{t('gami.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('gami.subtitle')}</p>
    </header>
  );
}

function XpHero({ data }: { data: GamificationInput }) {
  const { t } = useTranslation();
  const prog = levelProgress(
    data.completedWorkouts * 100 + data.totalSets * 5 + data.prCount * 50 + data.masteredSteps * 40,
  );
  const animatedXp = useCountUp(prog.xp);
  const offset = RING_CIRC * (1 - prog.fraction);

  return (
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
            {prog.level}
          </span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {t('gami.level')}
          </span>
        </div>
      </div>
      <p className="mt-4 font-display text-lg font-semibold">{t(prog.tier.nameKey)}</p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {prog.tier.altitudeM > 0 ? `${prog.tier.altitudeM.toLocaleString()} m · ` : ''}
        {animatedXp.toLocaleString()} XP
      </p>
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
        {t('gami.toNext', { xp: (prog.xpForNextLevel - prog.xp).toLocaleString() })}
      </p>
    </section>
  );
}

function Badges({ data }: { data: GamificationInput }) {
  const { t } = useTranslation();
  const badges = badgeStates(data);
  return (
    <section>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t('gami.badges')}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {badges.map((b) => (
          <div
            key={b.id}
            className={`flex flex-col items-center rounded-xl bg-card p-4 text-center ${
              b.isEarned ? '' : 'opacity-55'
            }`}
          >
            {b.isEarned ? (
              <Logo summit className="h-9 w-9 text-[hsl(var(--gold))]" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-elevated text-muted-foreground">
                <Lock className="h-4 w-4" />
              </span>
            )}
            <span className="mt-2 text-sm font-medium">{t(b.nameKey)}</span>
            <span className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
              {t(b.descKey)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Breakdown({ data }: { data: GamificationInput }) {
  const { t } = useTranslation();
  const rows = xpBreakdown(data);
  if (rows.length === 0) return null;
  return (
    <section className="rounded-xl bg-card p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t('gami.breakdown')}
      </p>
      <ul className="divide-y divide-border/60">
        {rows.map((r) => (
          <li key={r.labelKey} className="flex items-center justify-between py-2 text-sm">
            <span className="text-muted-foreground">
              {t(r.labelKey)} <span className="tabular-nums">×{r.count}</span>
            </span>
            <span className="font-mono tabular-nums">+{r.xp.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
