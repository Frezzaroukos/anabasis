import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { getTrainingHeat } from '@/lib/db/queries';
import { cn } from '@/lib/utils';

/**
 * Ημερολόγιο συνέπειας σε στυλ GitHub-contributions: 13 εβδομάδες × 7 ημέρες.
 * Γεμάτο κελί = προπόνηση, χρυσό περίγραμμα = PR εκείνη τη μέρα. Δίνει με μια
 * ματιά την εικόνα «κρατάω το σερί;» χωρίς να ανοίξεις το ημερολόγιο.
 */
export function ConsistencyHeatmap() {
  const { t } = useTranslation();
  const cells = useLiveQuery(() => getTrainingHeat(91), [], []);

  if (cells.length === 0) return null;
  const trainedCount = cells.filter((c) => c.trained).length;
  if (trainedCount === 0) return null;

  // Σε στήλες ανά εβδομάδα (7 κελιά η καθεμία), όπως το GitHub.
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-medium">{t('dashboard.last91days')}</h2>
        <span className="text-xs text-muted-foreground">
          {trainedCount} / 91 {t('profile.workouts')}
        </span>
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((c) => (
              <span
                key={c.date}
                title={c.date}
                className={cn(
                  'h-3 w-3 rounded-sm border',
                  c.trained
                    ? 'border-transparent bg-primary'
                    : 'border-border bg-muted/40',
                  c.hasPR && 'ring-1 ring-amber-500 ring-offset-1 ring-offset-card',
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
