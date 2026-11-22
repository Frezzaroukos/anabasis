import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { HeatmapDay } from '@/lib/db/analytics';
import { heatLevel } from './heatLevel';
import { localNoon } from '@/components/charts/timeRange';

const LEVEL_CLASS: Record<0 | 1 | 2, string> = {
  0: 'bg-muted/50',
  1: 'bg-primary/55',
  2: 'bg-primary',
};

/**
 * Consistency heatmap (τύπου GitHub): στήλη = εβδομάδα (Δευτέρα→Κυριακή),
 * σειρά = μέρα εβδομάδας. Καθαρό CSS grid — όχι recharts, άρα κανένα extra
 * chunk, και τα κελιά ακολουθούν το πλάτος (320px → 430px) χωρίς overflow.
 * Η `days` ξεκινά ΠΑΝΤΑ από Δευτέρα (βλ. buildTrainingHeatmap).
 */
export function TrainingHeatmap({ days, summary }: { days: HeatmapDay[]; summary: string }) {
  const { t } = useTranslation();
  const cols = Math.ceil(days.length / 7);
  const scroller = useRef<HTMLDivElement>(null);
  // Στενή οθόνη: τα κελιά κρατούν ≥12px και το πλέγμα κυλά ΜΟΝΟ μέσα στο card —
  // ξεκινά στο τέλος (σήμερα), όχι στην παλιότερη εβδομάδα.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [cols]);
  return (
    <div role="img" aria-label={summary} className="w-full">
      <div ref={scroller} className="w-full overflow-x-auto pb-1">
      <div
        className="grid gap-[3px]"
        style={{
          minWidth: cols * 15,
          maxWidth: cols * 24,
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: 'repeat(7, auto)',
          gridAutoFlow: 'column',
        }}
      >
        {days.map((d) => (
          <div
            key={d.date}
            title={`${localNoon(d.date).toLocaleDateString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })} · ${t('progress.analytics.sessionsCount', { count: d.sessions })}`}
            className={cn('aspect-square w-full rounded-[3px]', LEVEL_CLASS[heatLevel(d.sessions)])}
          />
        ))}
      </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
        <span>{t('progress.analytics.less')}</span>
        {([0, 1, 2] as const).map((l) => (
          <span key={l} className={cn('h-2.5 w-2.5 rounded-[3px]', LEVEL_CLASS[l])} />
        ))}
        <span>{t('progress.analytics.more')}</span>
      </div>
    </div>
  );
}
