import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArchiveRestore, Download, Pencil } from 'lucide-react';
import {
  exportExerciseCsv,
  getExercise,
  getExerciseProgress,
  getLastPerformance,
  getPRsByExercise,
  listExerciseCategories,
  setExerciseArchived,
} from '@/lib/db/queries';
import type { PersonalRecord } from '@/lib/db/types';
import { useAppSettings } from '@/hooks/useAppSettings';
import { toDisplayWeight } from '@/lib/units';
import {
  ExerciseProgressChart,
  CHART_RANGE_DAYS,
  type ChartMetric,
} from '@/components/charts/ExerciseProgressChart';
import type { ChartRangeKey } from '@/components/charts/timeRange';
import { ExerciseFormSheet } from './components/ExerciseFormSheet';
import { CategoryBadge } from '@/components/CategoryBadge';

const DETAIL_METRICS: ChartMetric[] = ['reps', 'topWeight', 'e1rm', 'volume'];

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
  const [metric, setMetric] = useState<ChartMetric>('topWeight');
  // Προεπιλογή 1Y — ίδιο παράθυρο με πριν (365 σταθερά), τώρα με πραγματικό
  // selector αντί να είναι κλειδωμένο.
  const [range, setRange] = useState<ChartRangeKey>('1Y');
  const [formOpen, setFormOpen] = useState(false);

  const exercise = useLiveQuery(() => getExercise(exerciseId), [exerciseId]);
  const rangeDays = CHART_RANGE_DAYS[range];
  const rawPoints = useLiveQuery(
    () => getExerciseProgress(exerciseId, rangeDays),
    [exerciseId, rangeDays],
    [],
  );
  const prs = useLiveQuery(
    () => getPRsByExercise(),
    [],
    new Map<string, PersonalRecord[]>(),
  );
  const last = useLiveQuery(() => getLastPerformance(exerciseId), [exerciseId]);
  const categories = useLiveQuery(() => listExerciseCategories(), [], []);
  const exercisePRs = prs.get(exerciseId) ?? [];

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
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="truncate font-display text-2xl font-semibold tracking-tight">{exercise.name}</h1>
            <CategoryBadge category={exercise.category} />
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              aria-label={t('exercises.editTitle')}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void setExerciseArchived(exercise.id, !exercise.is_archived)}
              aria-label={t(exercise.is_archived ? 'exercises.unarchive' : 'exercises.archive')}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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

      <ExerciseProgressChart
        rawPoints={rawPoints}
        prs={exercisePRs}
        unit={unit}
        metrics={DETAIL_METRICS}
        metric={metric}
        onMetricChange={setMetric}
        range={range}
        onRangeChange={setRange}
      />

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
