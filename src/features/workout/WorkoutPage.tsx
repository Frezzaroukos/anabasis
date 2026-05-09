import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { queries } from '@/lib/db';
import { LastWorkoutCard } from './components/LastWorkoutCard';

export function WorkoutPage() {
  const { t } = useTranslation();
  const [starting, setStarting] = useState(false);

  const onStart = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await queries.startWorkout();
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

      <Button size="lg" className="w-full" onClick={() => void onStart()} disabled={starting}>
        <Play className="h-5 w-5" />
        {t('workout.start')}
      </Button>

      <LastWorkoutCard />
    </div>
  );
}
