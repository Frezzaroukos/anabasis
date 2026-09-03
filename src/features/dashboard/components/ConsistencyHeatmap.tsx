import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { getTrainingHeat } from '@/lib/db/queries';
import { cn } from '@/lib/utils';
import { SectionTitle } from '@/components/ui/Section';
import { alignToWeekday, chunkIntoWeeks } from './heatmapMath';

/**
 * Ημερολόγιο συνέπειας σε στυλ GitHub-contributions: 13 εβδομάδες × 7 ημέρες.
 * Γεμάτο κελί = προπόνηση, χρυσό περίγραμμα = PR εκείνη τη μέρα. Δίνει με μια
 * ματιά την εικόνα «κρατάω το σερί;» χωρίς να ανοίξεις το ημερολόγιο.
 *
 * Τα νούμερα 7/30-ημερών ζουν πλέον ως λεπτή γραμμή στο DashboardPage (όχι
 * ξεχωριστό κουτί) — μετράνε τις ενεργές μέρες, ακόμα κι όταν η προπόνηση
 * είναι σε εξέλιξη, ενώ το heatmap μετρά μόνο ολοκληρωμένες.
 */
export function ConsistencyHeatmap() {
  const { t } = useTranslation();
  const cells = useLiveQuery(() => getTrainingHeat(91), [], []);

  if (cells.length === 0) return null;
  const trainedCount = cells.filter((c) => c.trained).length;
  if (trainedCount === 0) return null;

  // Ευθυγράμμιση σε πραγματικά όρια εβδομάδας (Δευτ…Κυρ) — βλ. heatmapMath.ts.
  const weeks = chunkIntoWeeks(alignToWeekday(cells));

  return (
    <div className="rounded-xl bg-card p-4">
      <SectionTitle
        action={
          <span className="font-mono text-xs text-muted-foreground">
            {trainedCount}/91 {t('profile.workouts')}
          </span>
        }
      >
        {t('dashboard.last91days')}
      </SectionTitle>

      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((c, di) =>
              c ? (
                <span
                  key={c.date}
                  title={c.date}
                  className={cn(
                    'h-3 w-3 rounded-[3px] border',
                    c.trained ? 'border-transparent bg-primary' : 'border-border/60 bg-muted/30',
                    c.hasPR && 'ring-1 ring-[hsl(var(--gold))] ring-offset-1 ring-offset-card',
                  )}
                />
              ) : (
                // Κενό padding-κελί πριν την πρώτη πραγματική μέρα — μόνο για
                // ευθυγράμμιση γραμμής εβδομάδας, όχι δεδομένο.
                <span key={`pad-${wi}-${di}`} aria-hidden className="h-3 w-3" />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
