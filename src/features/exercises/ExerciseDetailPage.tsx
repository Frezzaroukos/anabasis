import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArchiveRestore, Download, Pencil } from 'lucide-react';
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
import {
  exportExerciseCsv,
  getExercise,
  getExerciseProgress,
  getLastPerformance,
  getPRsByExercise,
  listExerciseCategories,
  setExerciseArchived,
} from '@/lib/db/queries';
import type { PersonalRecord, PRType } from '@/lib/db/types';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useCountUp } from '@/hooks/useCountUp';
import { toDisplayWeight } from '@/lib/units';
import {
  ACCENT_FILL_ID,
  ACTIVE_DOT,
  CHART_GOLD,
  CHART_GRID,
  CHART_STROKE,
  CHART_STROKE_WIDTH,
  CHART_TICK,
  ChartGradientDefs,
  TOOLTIP_STYLE,
} from '@/components/charts/chartTheme';
import { ExerciseFormSheet } from './components/ExerciseFormSheet';
import { categoryDotClass } from './utils';
import { cn } from '@/lib/utils';

type Metric = 'reps' | 'topWeight' | 'e1rm' | 'volume';

const METRICS: Metric[] = ['reps', 'topWeight', 'e1rm', 'volume'];
const METRIC_PR: Record<Metric, PRType> = {
  reps: 'max_reps',
  topWeight: 'max_weight',
  e1rm: 'e1rm',
  volume: 'max_volume',
};
const METRIC_LABEL_KEY: Record<Metric, string> = {
  reps: 'exercises.detail.reps',
  topWeight: 'progress.topWeight',
  e1rm: 'progress.e1rm',
  volume: 'progress.volume',
};

/**
 * Η πρόοδος μιας άσκησης — headline «alive» surface (owner feedback: charts
 * πρέπει να είναι top-level, όχι flat line). Reps/βάρος/e1RM/όγκος σε ΕΝΑ
 * chart με εναλλαγή metric, gold reference line στο πραγματικό PR, και ένα
 * ζωντανό ticker για το «καλύτερο» της περιόδου (useCountUp).
 */
export function ExerciseDetailPage() {
  const { t } = useTranslation();
  const { exerciseId = '' } = useParams();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const [metric, setMetric] = useState<Metric>('topWeight');
  const [formOpen, setFormOpen] = useState(false);

  const exercise = useLiveQuery(() => getExercise(exerciseId), [exerciseId]);
  const rawPoints = useLiveQuery(() => getExerciseProgress(exerciseId, 365), [exerciseId], []);
  const prs = useLiveQuery(
    () => getPRsByExercise(),
    [],
    new Map<string, PersonalRecord[]>(),
  );
  const last = useLiveQuery(() => getLastPerformance(exerciseId), [exerciseId]);
  const categories = useLiveQuery(() => listExerciseCategories(), [], []);

  const points = rawPoints.map((p) => ({
    ...p,
    topWeight: p.topWeight != null ? toDisplayWeight(p.topWeight, unit) : null,
    e1rm: p.e1rm != null ? toDisplayWeight(p.e1rm, unit) : null,
    volume: toDisplayWeight(p.volume, unit),
  }));
  const withData = points.filter((p) => p[metric] != null);
  const best = withData.length ? Math.max(...withData.map((p) => Number(p[metric]))) : 0;
  const bestTicker = useCountUp(best, 450, metric === 'reps' ? 0 : 1);

  const prRaw = prs.get(exerciseId)?.find((r) => r.type === METRIC_PR[metric])?.value;
  const prValue =
    prRaw == null ? null : metric === 'reps' ? prRaw : toDisplayWeight(prRaw, unit);

  const onExport = async () => {
    const csv = await exportExerciseCsv(exerciseId);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exercise?.name ?? 'exercise'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!exercise) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  return (
    <div className="animate-rise-in space-y-6">
      <header className="space-y-2">
        <Link to="/exercises" className="text-xs text-muted-foreground hover:text-foreground">
          ← {t('exercises.title')}
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={cn('h-3 w-3 shrink-0 rounded-full', categoryDotClass(exercise.category))}
              aria-hidden
            />
            <h1 className="font-display text-2xl font-semibold tracking-tight">{exercise.name}</h1>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              aria-label={t('exercises.editTitle')}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void setExerciseArchived(exercise.id, !exercise.is_archived)}
              aria-label={t(exercise.is_archived ? 'exercises.unarchive' : 'exercises.archive')}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {exercise.is_archived ? (
                <ArchiveRestore className="h-4 w-4" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {t(`exercises.movementType.${exercise.movement_type}`)}
          {exercise.equipment.length > 0 && ` · ${exercise.equipment.join(', ')}`}
        </p>
        {last && (
          <p className="text-xs text-muted-foreground">
            {t('exercises.detail.lastPerformed')}: {new Date(last.achieved_at).toLocaleDateString()}
            {last.weight_kg != null && ` · ${toDisplayWeight(last.weight_kg, unit)} ${unit}`}
            {last.reps != null && ` × ${last.reps}`}
            {last.hold_seconds != null && ` · ${last.hold_seconds}s`}
          </p>
        )}
      </header>

      <div className="flex gap-1">
        {METRICS.map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={cn(
              'rounded-md border border-border px-3 py-1 text-xs transition-colors',
              metric === m
                ? 'border-primary/40 bg-primary text-primary-foreground shadow-glow-sm'
                : 'hover:bg-elevated',
            )}
          >
            {t(METRIC_LABEL_KEY[m])}
          </button>
        ))}
      </div>

      {withData.length < 2 ? (
        <div className="rounded-lg bg-card p-6 text-center text-sm text-muted-foreground">
          {withData.length === 0 ? t('exercises.detail.noHistory') : t('progress.needMore')}
        </div>
      ) : (
        <div className="rounded-lg bg-card p-4">
          <div className="mb-2 flex items-baseline justify-between text-xs text-muted-foreground">
            <span>
              {withData.length} {t('progress.sessions')}
            </span>
            <span
              data-testid="exercise-best-value"
              className="font-mono text-base font-semibold text-foreground"
            >
              {bestTicker}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {metric === 'reps' ? t('exercises.detail.reps') : unit}
              </span>
            </span>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={withData} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
                <ChartGradientDefs />
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
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
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(d: string) => new Date(d).toLocaleDateString()}
                  formatter={(v: number) => [
                    metric === 'reps' ? `${v}` : `${v} ${unit}`,
                    t(METRIC_LABEL_KEY[metric]),
                  ]}
                />
                {prValue != null && (
                  <ReferenceLine y={prValue} stroke={CHART_GOLD} strokeDasharray="4 3">
                    <Label
                      value={`PR ${prValue}${metric === 'reps' ? '' : ` ${unit}`}`}
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

      <button
        onClick={() => void onExport()}
        className="flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        <Download className="h-3 w-3" aria-hidden />
        CSV
      </button>

      <ExerciseFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        exercise={exercise}
        categorySuggestions={categories}
      />
    </div>
  );
}
