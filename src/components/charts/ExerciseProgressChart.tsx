import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Label,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ExercisePoint } from '@/lib/db/queries';
import type { PersonalRecord, PRType, WeightUnit } from '@/lib/db/types';
import { useCountUp } from '@/hooks/useCountUp';
import { toDisplayWeight } from '@/lib/units';
import { cn } from '@/lib/utils';
import {
  ACCENT_FILL_ID,
  ACTIVE_DOT,
  CHART_CURSOR,
  CHART_GOLD,
  CHART_GRID,
  CHART_STROKE,
  CHART_STROKE_WIDTH,
  CHART_TICK,
  ChartGradientDefs,
  REFERENCE_LINE_DASH,
  TOOLTIP_STYLE,
} from './chartTheme';
import { TimeRangeSelector } from './TimeRangeSelector';
import { CHART_RANGE_DAYS, tickFormatterFor, tickIntervalFor, type ChartRangeKey } from './timeRange';

export type ChartMetric = 'reps' | 'topWeight' | 'e1rm' | 'volume';

interface MetricOption {
  key: ChartMetric;
  labelKey: string;
  prType: PRType;
  /** reps: όχι μετατροπή μονάδας/κατάληξη μονάδας — καθαρός αριθμός. */
  unitless?: boolean;
}

/** Μία πηγή αλήθειας για τα 4 δυνατά metrics — ποια tabs φαίνονται το
 * αποφασίζει ο caller (`metrics` prop), εδώ ζει μόνο ο ορισμός τους.
 * Fast-refresh warning αναμενόμενο (ίδιο μοτίβο με button.tsx/buttonVariants). */
// eslint-disable-next-line react-refresh/only-export-components
export const METRIC_OPTIONS: Record<ChartMetric, MetricOption> = {
  reps: { key: 'reps', labelKey: 'exercises.detail.reps', prType: 'max_reps', unitless: true },
  topWeight: { key: 'topWeight', labelKey: 'progress.topWeight', prType: 'max_weight' },
  e1rm: { key: 'e1rm', labelKey: 'progress.e1rm', prType: 'e1rm' },
  volume: { key: 'volume', labelKey: 'progress.volume', prType: 'max_volume' },
};

/** exposed για fetch-side χρήση (πόσες μέρες να ζητήσει ο caller). */
export { CHART_RANGE_DAYS };

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
  metric,
  onMetricChange,
  range,
  onRangeChange,
  className,
}: ExerciseProgressChartProps) {
  const { t } = useTranslation();
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
      })),
    [rawPoints, unit],
  );

  const withData = points.filter((p) => p[metric] != null);
  const best = withData.length ? Math.max(...withData.map((p) => Number(p[metric]))) : 0;
  const bestTicker = useCountUp(best, 450, option.unitless ? 0 : 1);
  const unitSuffix = option.unitless ? t(option.labelKey) : unit;

  const prRaw = prs.find((r) => r.type === option.prType)?.value ?? null;
  const prValue = prRaw == null ? null : option.unitless ? prRaw : toDisplayWeight(prRaw, unit);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {metrics.map((m) => (
            <button
              key={m}
              onClick={() => onMetricChange(m)}
              className={cn(
                'rounded-md border border-border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
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
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={withData} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
                <ChartGradientDefs />
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={tickFormatterFor(range)}
                  interval={tickIntervalFor(range, withData.length)}
                  tick={CHART_TICK}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={['dataMin - 2', 'dataMax + 2']}
                  tick={CHART_TICK}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={CHART_CURSOR}
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(d: string) => new Date(d).toLocaleDateString()}
                  formatter={(v: number) => [
                    option.unitless ? `${v}` : `${v} ${unit}`,
                    t(option.labelKey),
                  ]}
                />
                {prValue != null && (
                  <ReferenceLine y={prValue} stroke={CHART_GOLD} strokeDasharray={REFERENCE_LINE_DASH}>
                    <Label
                      value={`PR ${prValue}${option.unitless ? '' : ` ${unit}`}`}
                      position="insideTopRight"
                      fill={CHART_GOLD}
                      className="text-[10px]"
                    />
                  </ReferenceLine>
                )}
                <Area
                  type="monotone"
                  dataKey={metric}
                  stroke={CHART_STROKE}
                  strokeWidth={CHART_STROKE_WIDTH}
                  fill={`url(#${ACCENT_FILL_ID})`}
                  dot={{ r: 2, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                  activeDot={ACTIVE_DOT}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
