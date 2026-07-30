import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LOCAL_USER_ID } from '@/lib/db';
import { formatHMS } from '@/hooks/useSessionTimer';
import { getRecentPRs } from '@/lib/db/queries';
import { VolumeChart } from './components/VolumeChart';
import { Link } from 'react-router-dom';

export function HistoryPage() {
  const { t } = useTranslation();

  const completed = useLiveQuery(async () => {
    const all = await db.workouts.where('user_id').equals(LOCAL_USER_ID).toArray();
    return all
      .filter((w) => w.ended_at != null && w.deleted_at == null)
      .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''));
  }, []);

  const list = completed ?? [];

  const prs = useLiveQuery(() => getRecentPRs(8), [], []);
  const exerciseNames = useLiveQuery(
    async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e.name])),
    [],
    new Map<string, string>(),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('history.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {list.length} {t('history.completed')}
        </p>
      </header>

      <Link
        to="/progress"
        className="block rounded-lg border border-border bg-card px-4 py-3 text-sm transition-colors hover:bg-muted/50"
      >
        {t('progress.title')} →
      </Link>

      <VolumeChart />

      {prs.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium">{t('history.recentPRs')}</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {prs.map((pr) => (
              <li key={pr.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-amber-500" aria-hidden>
                  ★
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {exerciseNames.get(pr.exercise_id) ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`history.pr.${pr.type}`)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm">{Math.round(pr.value * 10) / 10}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(pr.achieved_at).toLocaleDateString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {list.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {t('history.empty')}
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((w) => (
            <li
              key={w.id}
              className="rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium">
                  {w.workout_type ?? t('workout.title')}
                </p>
                <span className="text-xs text-muted-foreground">
                  {new Date(w.started_at).toLocaleDateString()}
                </span>
              </div>
              <div className="mt-1 flex gap-3 font-mono text-xs text-muted-foreground">
                <span>{formatHMS(w.duration_seconds ?? 0)}</span>
                <span>·</span>
                <span>
                  {new Date(w.started_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
