import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight } from 'lucide-react';
import { db } from '@/lib/db';
import { listActivities, listCompletedWorkouts } from '@/lib/db/queries';
import { SectionTitle } from '@/components/ui/Section';
import { relativeDayLabel } from './relativeDay';

/**
 * Η τελευταία ολοκληρωμένη προπόνηση, καρφιτσωμένη στη ζώνη «σήμερα».
 * Ένα πάτημα ανοίγει τη λεπτομέρεια — δεν χρειάζεται να κατέβεις στα «Πρόσφατα».
 */
export function LastWorkoutCard() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const workouts = useLiveQuery(() => listCompletedWorkouts(), [], undefined);
  const labels = useLiveQuery(
    async () => new Map((await listActivities(true)).map((activity) => [activity.key, activity.label])),
    [],
    new Map<string, string>(),
  );
  const last = workouts?.[0];
  const setCount = useLiveQuery(async () => {
    if (!last) return 0;
    const rows = await db.sets.where('workout_id').equals(last.id).toArray();
    return rows.filter((set) => set.deleted_at == null).length;
  }, [last?.id]);

  if (workouts === undefined) {
    return <div className="h-16 animate-pulse rounded-xl bg-muted/30" />;
  }
  if (!last) return null;

  const name =
    last.workout_type?.trim() ||
    labels.get(last.activity_kind) ||
    last.activity_kind;
  const when = relativeDayLabel(last.started_at, t, locale);
  const mins = last.duration_seconds != null ? Math.round(last.duration_seconds / 60) : null;
  const meta = [
    when,
    mins != null && mins > 0 ? `${mins}′` : null,
    setCount ? `${setCount} ${t('history.totalSets')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="rounded-xl bg-card p-4">
      <SectionTitle>{t('dashboard.lastWorkout')}</SectionTitle>
      <Link
        to={`/history/${last.id}`}
        aria-label={t('dashboard.lastWorkoutOpen', { name })}
        className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 ring-offset-background transition-colors hover:bg-elevated focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block text-xs text-muted-foreground tabular-nums">{meta}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </section>
  );
}
