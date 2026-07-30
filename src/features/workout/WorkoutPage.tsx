import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { queries } from '@/lib/db';
import type { ActivityKind } from '@/lib/db/types';
import { LastWorkoutCard } from './components/LastWorkoutCard';
import { cn } from '@/lib/utils';

/**
 * Δραστηριότητες που ξεκινούν από εδώ. Το `strength`/`skill` οδηγούν στον
 * logger με σετ· τα υπόλοιπα καταγράφονται με χρόνο (και απόσταση), γι' αυτό
 * η επιλογή γίνεται ΠΡΙΝ το start — αλλάζει τι μετράμε.
 */
const KINDS: ActivityKind[] = [
  'strength',
  'skill',
  'run',
  'basketball',
  'cycling',
  'swim',
  'mobility',
  'other',
];

export function WorkoutPage() {
  const { t } = useTranslation();
  const [starting, setStarting] = useState(false);
  const [kind, setKind] = useState<ActivityKind>('strength');

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
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn(
                'rounded-md border border-border px-3 py-1.5 text-sm transition-colors',
                kind === k ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              {t(`activity.${k}`)}
            </button>
          ))}
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
