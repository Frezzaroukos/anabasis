import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, } from '@/lib/db';
import { getCurrentUserId } from '@/lib/db/session';
import { formatHMS } from '@/hooks/useSessionTimer';

export function LastWorkoutCard() {
  const { t } = useTranslation();

  const data = useLiveQuery(async () => {
    const all = await db.workouts.where('user_id').equals(getCurrentUserId()).toArray();
    const completed = all
      .filter((w) => w.ended_at != null && w.deleted_at == null)
      .sort((a, b) => (b.ended_at ?? '').localeCompare(a.ended_at ?? ''))[0];
    if (!completed) return null;

    const sets = await db.sets.where('workout_id').equals(completed.id).toArray();
    const live = sets.filter((s) => s.deleted_at == null);
    const exerciseIds = new Set(live.map((s) => s.exercise_id));

    return {
      workout: completed,
      setsCount: live.length,
      exercisesCount: exerciseIds.size,
    };
  }, []);

  if (data == null) return null; // loading or no data

  const { workout, setsCount, exercisesCount } = data;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {t('workout.lastWorkout')}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(workout.ended_at ?? workout.started_at).toLocaleDateString()}
        </p>
      </div>
      {workout.workout_type && (
        <p className="mt-1 text-sm font-medium">{workout.workout_type}</p>
      )}
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('workout.duration')}
          </dt>
          <dd className="font-mono text-base">
            {formatHMS(workout.duration_seconds ?? 0)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('workout.exercises')}
          </dt>
          <dd className="font-mono text-base">{exercisesCount}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('workout.sets')}
          </dt>
          <dd className="font-mono text-base">{setsCount}</dd>
        </div>
      </dl>
    </section>
  );
}
