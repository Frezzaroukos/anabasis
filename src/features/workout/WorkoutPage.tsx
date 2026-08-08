import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Play, Settings2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { db, queries } from '@/lib/db';
import { getCurrentUserId } from '@/lib/db/session';
import { listActivities } from '@/lib/db/queries';
import type { ActivityKind } from '@/lib/db/types';
import { ActivityChip } from '@/components/ActivityChip';
import { LastWorkoutCard } from './components/LastWorkoutCard';
import { cn } from '@/lib/utils';

export function WorkoutPage() {
  const { t } = useTranslation();
  const [starting, setStarting] = useState(false);
  const [kind, setKind] = useState<ActivityKind>('strength');
  // Πότε έγινε η προπόνηση: «σήμερα» (live) ή παλιότερη μέρα (backdated).
  // Λύνει το «χθες έκανα αυτό» — ίδια λογική με το Notion calendar σου.
  const [when, setWhen] = useState<'now' | string>('now');
  const todayIso = new Date().toISOString().slice(0, 10);

  // Οι δραστηριότητες έρχονται από τη βάση, όχι από hardcoded λίστα — ό,τι
  // άθλημα προσθέσεις εμφανίζεται εδώ αμέσως, χωρίς αλλαγή κώδικα.
  const activities = useLiveQuery(() => listActivities(), [], []);

  // Ελέγχει αν υπάρχει έστω μία ολοκληρωμένη προπόνηση, για να ξέρουμε αν
  // θα δείξουμε το LastWorkoutCard ή ένα ενθαρρυντικό empty state.
  const hasHistory = useLiveQuery(async () => {
    const all = await db.workouts.where('user_id').equals(getCurrentUserId()).toArray();
    return all.some((w) => w.ended_at != null && w.deleted_at == null);
  }, []);

  const onStart = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await queries.startWorkout(kind, when === 'now' ? undefined : when);
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
            <ActivityChip
              key={a.key}
              activity={a}
              selected={kind === a.key}
              onClick={() => setKind(a.key)}
            />
          ))}
          <Link
            to="/activities"
            aria-label={t('activities.title')}
            className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {t('activities.title')}
          </Link>
        </div>
      </section>

      {/* Πότε: σήμερα (live) ή άλλη μέρα (καταγραφή περασμένης προπόνησης) */}
      <section>
        <p className="mb-2 text-xs uppercase text-muted-foreground">
          {t('workout.whenLabel')}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWhen('now')}
            className={cn(
              'rounded-md border border-border px-3 py-1.5 text-sm transition-colors',
              when === 'now' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
            )}
          >
            {t('workout.whenNow')}
          </button>
          <input
            type="date"
            max={todayIso}
            value={when === 'now' ? '' : when}
            onChange={(e) => setWhen(e.target.value || 'now')}
            aria-label={t('workout.whenPast')}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </section>

      <Button size="lg" className="w-full" onClick={() => void onStart()} disabled={starting}>
        <Play className="h-5 w-5" />
        {when === 'now' ? t('workout.start') : t('workout.addPast')}
      </Button>

      {hasHistory === false ? (
        <section className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card p-6 text-center">
          <Logo className="h-10 w-10 text-primary" />
          <p className="text-sm font-medium">{t('workout.emptyHistoryTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('workout.emptyHistoryHint')}</p>
        </section>
      ) : (
        <LastWorkoutCard />
      )}
    </div>
  );
}
