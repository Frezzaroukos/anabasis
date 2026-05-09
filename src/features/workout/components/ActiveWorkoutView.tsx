import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/dialog';
import { queries } from '@/lib/db';
import type { Exercise, Workout } from '@/lib/db/types';
import { useExercises } from '@/hooks/useExercises';
import { useWorkoutSets, useWorkoutExerciseIds } from '@/hooks/useWorkoutSets';
import { SessionTimer } from './SessionTimer';
import { ExerciseCard } from './ExerciseCard';
import { AddExerciseSheet } from './AddExerciseSheet';
import { RestTimer } from './RestTimer';

interface ActiveWorkoutViewProps {
  workout: Workout;
}

export function ActiveWorkoutView({ workout }: ActiveWorkoutViewProps) {
  const { t } = useTranslation();
  const sets = useWorkoutSets(workout.id);
  const persistedExerciseIds = useWorkoutExerciseIds(workout.id);
  const exercises = useExercises();

  // Pending = exercises added in this session that haven't received a set yet.
  // Memory-only by design: refresh discards them (sets persist).
  const [pending, setPending] = useState<Exercise[]>([]);
  const [weightedById, setWeightedById] = useState<Record<string, boolean>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [workoutType, setWorkoutType] = useState(workout.workout_type ?? '');

  const exerciseById = useMemo(() => {
    const m = new Map<string, Exercise>();
    for (const e of exercises) m.set(e.id, e);
    return m;
  }, [exercises]);

  const setsByExercise = useMemo(() => {
    const m = new Map<string, typeof sets>();
    for (const s of sets) {
      const arr = m.get(s.exercise_id) ?? [];
      arr.push(s);
      m.set(s.exercise_id, arr);
    }
    return m;
  }, [sets]);

  const orderedIds = useMemo(() => {
    // Persisted (have sets) first, then pending (no sets yet).
    const seen = new Set<string>(persistedExerciseIds);
    const pendingIds = pending.map((e) => e.id).filter((id) => !seen.has(id));
    return [...persistedExerciseIds, ...pendingIds];
  }, [persistedExerciseIds, pending]);

  // Drop pending entries once they get a set persisted.
  useEffect(() => {
    setPending((cur) => cur.filter((p) => !persistedExerciseIds.includes(p.id)));
  }, [persistedExerciseIds]);

  const onAddExercise = (ex: Exercise) => {
    if (orderedIds.includes(ex.id)) return;
    setPending((cur) => [...cur, ex]);
    setWeightedById((cur) => ({
      ...cur,
      [ex.id]: !ex.is_bodyweight, // BW exercises default to bodyweight mode
    }));
  };

  const onWorkoutTypeBlur = () => {
    const trimmed = workoutType.trim();
    void queries.setWorkoutType(workout.id, trimmed === '' ? null : trimmed);
  };

  const onConfirmEnd = async () => {
    setConfirmEnd(false);
    await queries.endWorkout(workout.id);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background safe-top">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">
            {t('workout.active')}
          </p>
          <SessionTimer startedAt={workout.started_at} />
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setConfirmEnd(true)}
          className="shrink-0"
        >
          <X className="h-4 w-4" />
          {t('workout.end')}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-32 pt-3">
        <div className="mb-4">
          <Input
            value={workoutType}
            onChange={(e) => setWorkoutType(e.target.value)}
            onBlur={onWorkoutTypeBlur}
            placeholder={t('workout.typePlaceholder')}
            className="h-9 text-sm"
          />
        </div>

        {orderedIds.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t('workout.noExercises')}
          </p>
        ) : (
          <div className="space-y-3">
            {orderedIds.map((id) => {
              const ex = exerciseById.get(id);
              if (!ex) return null;
              const exSets = setsByExercise.get(id) ?? [];
              const weightedDefault = !ex.is_bodyweight;
              const weighted = weightedById[id] ?? weightedDefault;
              return (
                <ExerciseCard
                  key={id}
                  exercise={ex}
                  workoutId={workout.id}
                  sets={exSets}
                  weighted={weighted}
                  onWeightedChange={(next) =>
                    setWeightedById((cur) => ({ ...cur, [id]: next }))
                  }
                />
              );
            })}
          </div>
        )}

        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={() => setSheetOpen(true)}
        >
          <Plus className="h-4 w-4" />
          {t('workout.addExercise')}
        </Button>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-4 py-3 safe-bottom backdrop-blur">
        <div className="mx-auto max-w-md">
          <RestTimer />
        </div>
      </div>

      <AddExerciseSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPick={onAddExercise}
        excludeIds={orderedIds}
      />

      <ConfirmDialog
        open={confirmEnd}
        title={t('workout.endConfirmTitle')}
        description={t('workout.endConfirmDesc')}
        confirmLabel={t('workout.end')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => void onConfirmEnd()}
        onCancel={() => setConfirmEnd(false)}
      />
    </div>
  );
}
