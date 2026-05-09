import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';

export function WorkoutPage() {
  const { t } = useTranslation();
  const exerciseCount = useLiveQuery(() => db.exercises.count(), [], 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('workout.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {exerciseCount} exercises seeded · ready when you are
        </p>
      </header>

      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">{t('workout.empty')}</p>
        <Button className="mt-4" size="lg" disabled>
          {t('workout.start')}
        </Button>
      </div>
    </div>
  );
}
