import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { getGamificationInput } from '@/lib/db/queries';
import { levelProgress, hasActivity } from '@/lib/gamification';
import { SectionTitle } from '@/components/ui/Section';

const RING_R = 26;
const RING_CIRC = 2 * Math.PI * RING_R;

/**
 * Συμπαγής κάρτα Αρχικής: στάδιο + επίπεδο + δακτύλιος προόδου προς το επόμενο.
 * Επιστρέφει null σε φρέσκο προφίλ (καμία δραστηριότητα) — όχι ψεύτικο level-1.
 */
export function AltitudeCard() {
  const { t } = useTranslation();
  const data = useLiveQuery(() => getGamificationInput(), [], null);
  if (!data || !hasActivity(data)) return null;

  const prog = levelProgress(
    data.completedWorkouts * 100 + data.totalSets * 5 + data.prCount * 50 + data.masteredSteps * 40,
  );
  const offset = RING_CIRC * (1 - prog.fraction);

  return (
    <Link to="/achievements" className="block rounded-xl bg-card p-4 transition-colors hover:bg-elevated">
      <div className="mb-1 flex items-baseline justify-between">
        <SectionTitle>{t('gami.title')}</SectionTitle>
        <span aria-hidden className="text-xs text-muted-foreground">→</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
            <circle cx="32" cy="32" r={RING_R} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
            <circle
              cx="32"
              cy="32"
              r={RING_R}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={RING_CIRC}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)' }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-semibold tabular-nums">
            {prog.level}
          </span>
        </div>
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold leading-tight">{t(prog.tier.nameKey)}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {t('gami.toNext', { xp: (prog.xpForNextLevel - prog.xp).toLocaleString() })}
          </p>
        </div>
      </div>
    </Link>
  );
}
