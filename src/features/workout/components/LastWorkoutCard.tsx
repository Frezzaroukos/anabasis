import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, } from '@/lib/db';
import { getCurrentUserId } from '@/lib/db/session';
import { formatHMS } from '@/hooks/useSessionTimer';
import { SectionTitle } from '@/components/ui/Section';

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
    <section className="rounded-xl bg-card p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <SectionTitle className="mb-0">{t('workout.lastWorkout')}</SectionTitle>
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          {new Date(workout.ended_at ?? workout.started_at).toLocaleDateString()}
        </p>
      </div>
      {workout.workout_type && (
        <p className="text-sm font-medium">{workout.workout_type}</p>
      )}
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/40 py-2">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('workout.duration')}
          </dt>
          <dd className="mt-0.5 font-mono text-base tabular-nums leading-none">
            {formatHMS(workout.duration_seconds ?? 0)}
          </dd>
        </div>
        <div className="rounded-lg bg-muted/40 py-2">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('workout.exercises')}
          </dt>
          <dd className="mt-0.5 font-mono text-base tabular-nums leading-none">{exercisesCount}</dd>
        </div>
        <div className="rounded-lg bg-muted/40 py-2">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('workout.sets')}
          </dt>
          <dd className="mt-0.5 font-mono text-base tabular-nums leading-none">{setsCount}</dd>
        </div>
      </dl>
    </section>
  );
}
