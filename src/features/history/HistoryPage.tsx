import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

export function HistoryPage() {
  const { t } = useTranslation();
  const workoutCount = useLiveQuery(() => db.workouts.count(), [], 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('history.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workoutCount} sessions logged
        </p>
      </header>

      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {t('history.empty')}
      </div>
    </div>
  );
}
