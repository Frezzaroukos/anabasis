import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExercisePoint } from '@/lib/db/queries';
import type { PersonalRecord, PRType, WeightUnit } from '@/lib/db/types';
import { useCountUp } from '@/hooks/useCountUp';
import { toDisplayWeight } from '@/lib/units';
import { cn } from '@/lib/utils';
import { ChartSkeleton } from './ChartSkeleton';
import { TimeRangeSelector } from './TimeRangeSelector';
import { CHART_RANGE_DAYS, type ChartRangeKey } from './timeRange';

const ExerciseProgressChartBody = lazy(() => import('./ExerciseProgressChart.body'));

export type ChartMetric = 'reps' | 'topWeight' | 'e1rm' | 'volume' | 'hold';

interface MetricOption {
  key: ChartMetric;
  labelKey: string;
  prType: PRType;
  /** reps: όχι μετατροπή μονάδας/κατάληξη μονάδας — καθαρός αριθμός. */
  unitless?: boolean;
  /** κατάληξη για unitless metrics (π.χ. 's' στα holds) */
  suffix?: string;
  /** πεδίο του ExercisePoint που ζωγραφίζεται (το 'reps' διαβάζει maxReps) */
  field: 'maxReps' | 'topWeight' | 'e1rm' | 'volume' | 'hold';
}

/** Μία πηγή αλήθειας για τα 4 δυνατά metrics — ποια tabs φαίνονται το
 * αποφασίζει ο caller (`metrics` prop), εδώ ζει μόνο ο ορισμός τους.
 * Fast-refresh warning αναμενόμενο (ίδιο μοτίβο με button.tsx/buttonVariants). */
// eslint-disable-next-line react-refresh/only-export-components
export const METRIC_OPTIONS: Record<ChartMetric, MetricOption> = {
  reps: { key: 'reps', labelKey: 'exercises.detail.reps', prType: 'max_reps', unitless: true, field: 'maxReps' },
  topWeight: { key: 'topWeight', labelKey: 'progress.topWeight', prType: 'max_weight', field: 'topWeight' },
  e1rm: { key: 'e1rm', labelKey: 'progress.e1rm', prType: 'e1rm', field: 'e1rm' },
  volume: { key: 'volume', labelKey: 'progress.volume', prType: 'max_volume', field: 'volume' },
  hold: { key: 'hold', labelKey: 'progress.hold', prType: 'max_hold', unitless: true, suffix: 's', field: 'hold' },
};

/** exposed για fetch-side χρήση (πόσες μέρες να ζητήσει ο caller). */
export { CHART_RANGE_DAYS };

/**
 * Ποιο αποθηκευμένο PR αντιστοιχεί στη σειρά του chart. Στις ασκήσεις
 * σωματικού βάρους το chart δείχνει ΣΥΝΟΛΙΚΟ φορτίο (σώμα + πρόσθετο) για
 * topWeight/e1rm — άρα η γραμμή PR πρέπει να είναι το συνολικό ρεκόρ
 * (max_total_load / e1rm_total), όχι το πρόσθετο (max_weight / e1rm), αλλιώς
 * θα καθόταν σε άλλη κλίμακα. Volume/reps είναι ήδη στην ίδια βάση.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function prTypeFor(metric: ChartMetric, isBodyweight: boolean): PRType {
  if (isBodyweight && metric === 'topWeight') return 'max_total_load';
  if (isBodyweight && metric === 'e1rm') return 'e1rm_total';
  return METRIC_OPTIONS[metric].prType;
}

/**
 * Ποια metric tabs έχουν πραγματικά δεδομένα. Μια άσκηση hold (planche) δεν
 * έχει top weight/reps — η προεπιλογή «top set» θα έδειχνε άδειο chart ενώ
 * υπάρχει ιστορικό. Χωρίς κανένα δεδομένο γυρνά όλα τα tabs (empty state).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function resolveMetrics(
  metrics: ChartMetric[],
  metric: ChartMetric,
  points: ReadonlyArray<Partial<Record<MetricOption['field'], number | null>>>,
): { tabs: ChartMetric[]; active: ChartMetric } {
  const hasData = (m: ChartMetric) =>
    points.some((p) => {
      const v = p[METRIC_OPTIONS[m].field];
      return v != null && (m !== 'volume' || v > 0);
    });
  const withData = metrics.filter(hasData);
  if (withData.length === 0) return { tabs: metrics.filter((m) => m !== 'hold'), active: metric };
  return { tabs: withData, active: withData.includes(metric) ? metric : withData[0]! };
}

interface ExerciseProgressChartProps {
  /** Ωμά σημεία σε kg (getExerciseProgress) — η μετατροπή μονάδας γίνεται εδώ. */
  rawPoints: ExercisePoint[];
  /** PRs ΗΔΗ φιλτραρισμένα στην τρέχουσα άσκηση. */
  prs: PersonalRecord[];
  unit: WeightUnit;
  /** Ποια metrics φαίνονται ως tabs, με τη σειρά. */
  metrics: ChartMetric[];
  metric: ChartMetric;
  onMetricChange: (m: ChartMetric) => void;
  range: ChartRangeKey;
  /** undefined = χωρίς selector (fixed range, καθορισμένο απ' έξω). */
  onRangeChange?: (r: ChartRangeKey) => void;
  /** true = το chart δείχνει συνολικό φορτίο· κρύβει τη γραμμή PR όπου δεν συγκρίνεται. */
  isBodyweight?: boolean;
  className?: string;
}

/**
 * Ενιαίο chart προόδου άσκησης — ήταν διπλωμένο σε ProgressPage +
 * ExerciseDetailPage (~90 σχεδόν πανομοιότυπες γραμμές, με μικρές
 * αναντιστοιχίες: το ExerciseDetailPage δεν είχε πραγματικό range-selector
 * ούτε tick-thinning σε μεγάλα εύρη, το ProgressPage δεν είχε το animated
 * "best" ticker). Ενοποιημένο εδώ κρατά ΚΑΙ τις δύο δυνατότητες παντού.
 */
export function ExerciseProgressChart({
  rawPoints,
  prs,
  unit,
  metrics,
  metric: requestedMetric,
  onMetricChange,
  range,
  onRangeChange,
  isBodyweight = false,
  className,
}: ExerciseProgressChartProps) {
  const { t } = useTranslation();
  const { tabs, active: metric } = resolveMetrics(metrics, requestedMetric, rawPoints);
  const option = METRIC_OPTIONS[metric];

  // Τα σημεία έρχονται σε kg (storage) — μετατρέπονται στη μονάδα του χρήστη
  // ΕΔΩ, μία φορά, ώστε το chart/PR-line/«best» να δουλεύουν όλα στην ίδια κλίμακα.
  const points = useMemo(
    () =>
      rawPoints.map((p) => ({
        ...p,
        topWeight: p.topWeight != null ? toDisplayWeight(p.topWeight, unit) : null,
        e1rm: p.e1rm != null ? toDisplayWeight(p.e1rm, unit) : null,
        volume: toDisplayWeight(p.volume, unit),
        maxReps: p.maxReps,
        hold: p.hold,
        bwEstimated: p.bwEstimated ?? false,
      })),
    [rawPoints, unit],
  );

  const withData = points.filter((p) => p[option.field] != null);
  const best = withData.length ? Math.max(...withData.map((p) => Number(p[option.field]))) : 0;
  const bestTicker = useCountUp(best, 450, option.unitless ? 0 : 1);
  const unitSuffix = option.suffix ?? (option.unitless ? t(option.labelKey) : unit);

  // Μπορεί να υπάρχουν πολλές live εγγραφές ίδιου τύπου (sync/import) — το
  // ρεκόρ είναι η μέγιστη, όχι η πρώτη που επιστρέφει η βάση.
  const prType = prTypeFor(metric, isBodyweight);
  const sameType = prs.filter((r) => r.type === prType && r.deleted_at == null);
  const prRaw = sameType.length ? Math.max(...sameType.map((r) => r.value)) : null;
  const prValue =
    prRaw == null
      ? null
      : option.unitless
        ? prRaw
        : toDisplayWeight(prRaw, unit);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {tabs.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={metric === m}
              onClick={() => onMetricChange(m)}
              className={cn(
                'min-h-9 rounded-md border border-border px-3 py-1 text-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                metric === m
                  ? 'border-primary/40 bg-primary text-primary-foreground shadow-glow-sm'
                  : 'hover:bg-elevated',
              )}
            >
              {t(METRIC_OPTIONS[m].labelKey)}
            </button>
          ))}
        </div>
        {onRangeChange && <TimeRangeSelector value={range} onChange={onRangeChange} />}
      </div>

      {withData.length < 2 ? (
        <div className="mt-3 rounded-xl bg-card p-6 text-center text-sm text-muted-foreground">
          {withData.length === 0 ? t('exercises.detail.noHistory') : t('progress.needMore')}
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-card p-4">
          <div className="mb-2 flex items-baseline justify-between text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">
              {withData.length} {t('progress.sessions')}
            </span>
            <span
              data-testid="exercise-best-value"
              className="font-mono text-base font-semibold tabular-nums text-foreground"
            >
              {bestTicker}
              <span className="ml-1 text-xs font-normal text-muted-foreground">{unitSuffix}</span>
            </span>
          </div>
          <div className="h-52 w-full">
            <Suspense fallback={<ChartSkeleton />}>
              <ExerciseProgressChartBody
                withData={withData}
                dataKey={option.field}
                range={range}
                unit={unit}
                unitless={!!option.unitless}
                suffix={option.suffix}
                labelKey={option.labelKey}
                prValue={prValue}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
