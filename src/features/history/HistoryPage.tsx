import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LOCAL_USER_ID } from '@/lib/db';
import { formatHMS } from '@/hooks/useSessionTimer';

export function HistoryPage() {
  const { t } = useTranslation();

  const completed = useLiveQuery(async () => {
    const all = await db.workouts.where('user_id').equals(LOCAL_USER_ID).toArray();
    return all
      .filter((w) => w.ended_at != null && w.deleted_at == null)
      .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''));
  }, []);

  const list = completed ?? [];

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
