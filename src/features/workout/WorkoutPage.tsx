import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Play, Settings2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { queries } from '@/lib/db';
import { listActivities } from '@/lib/db/queries';
import type { ActivityKind } from '@/lib/db/types';
import { LastWorkoutCard } from './components/LastWorkoutCard';
import { cn } from '@/lib/utils';

export function WorkoutPage() {
  const { t } = useTranslation();
  const [starting, setStarting] = useState(false);
  const [kind, setKind] = useState<ActivityKind>('strength');

  // Οι δραστηριότητες έρχονται από τη βάση, όχι από hardcoded λίστα — ό,τι
  // άθλημα προσθέσεις εμφανίζεται εδώ αμέσως, χωρίς αλλαγή κώδικα.
  const activities = useLiveQuery(() => listActivities(), [], []);

  const onStart = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await queries.startWorkout(kind);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('workout.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('workout.empty')}</p>
      </header>

      <section>
        <p className="mb-2 text-xs uppercase text-muted-foreground">
          {t('workout.activityKind')}
        </p>
        <div className="flex flex-wrap gap-2">
          {activities.map((a) => (
            <button
              key={a.key}
              onClick={() => setKind(a.key)}
              className={cn(
                'rounded-md border border-border px-3 py-1.5 text-sm transition-colors',
                kind === a.key
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent',
              )}
            >
              <span aria-hidden className="mr-1.5">
                {a.icon}
              </span>
              {a.label}
            </button>
          ))}
          <Link
            to="/activities"
            aria-label={t('activities.title')}
            className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {t('activities.title')}
          </Link>
        </div>
      </section>

      <Button size="lg" className="w-full" onClick={() => void onStart()} disabled={starting}>
        <Play className="h-5 w-5" />
        {t('workout.start')}
      </Button>

      <LastWorkoutCard />
    </div>
  );
}
