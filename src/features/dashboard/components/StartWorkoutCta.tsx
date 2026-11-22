import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Play } from 'lucide-react';
import { listScheduledForDay, startScheduledSession } from '@/lib/db/scheduledSessions';
import { localDay, startAdHocWorkout } from '@/lib/db/queries';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { homePrimaryAction } from './homePrimary';

/**
 * Η πρωταρχική δράση της Αρχικής. Καρφιτσώνεται πάνω από τις κάρτες
 * (το registry τη κρατά κλειδωμένη-ορατή· η θέση της δεν θάβεται πια
 * κάτω από στατιστικά).
 *
 * Έναρξη = κενή σημερινή συνεδρία, ένα πάτημα. Πρόγραμμα και επικόλληση
 * μένουν στο ημερολόγιο και στις γρήγορες ενέργειες από κάτω.
 */
export function StartWorkoutCta() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const today = localDay();
  const active = useActiveWorkout();
  const sessions = useLiveQuery(() => listScheduledForDay(today), [today], undefined);
  const planned = sessions?.filter((session) => session.status === 'planned');
  const action = homePrimaryAction(active, planned);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startScheduled = async (sessionId: string) => {
    const session = sessions?.find((row) => row.id === sessionId);
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await startScheduledSession(session);
      if (!result) {
        setError(t('dashboard.startBlocked'));
        return;
      }
      navigate('/workout/active');
    } finally {
      setBusy(false);
    }
  };

  const startToday = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await startAdHocWorkout('strength');
      if (!result) {
        setError(t('dashboard.startBlocked'));
        return;
      }
      navigate('/workout/active');
    } finally {
      setBusy(false);
    }
  };

  if (action.kind === 'loading') {
    return <div className="h-[4.5rem] animate-pulse rounded-xl bg-muted/40" />;
  }

  const title =
    action.kind === 'continue'
      ? t('dashboard.continueCta')
      : action.kind === 'scheduled'
        ? t('dashboard.scheduledCta', { title: action.title })
        : t('dashboard.startCta');
  const sub =
    action.kind === 'continue'
      ? t('dashboard.continueSub')
      : action.kind === 'scheduled'
        ? t('dashboard.scheduledSub')
        : t('dashboard.startSub');

  const className =
    'flex w-full items-center justify-between gap-3 rounded-xl bg-primary px-5 py-4 text-left text-primary-foreground shadow-glow-sm ring-offset-background transition-all duration-200 hover:shadow-glow active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60';

  const body = (
    <>
      <span className="min-w-0">
        <span className="block truncate text-lg font-semibold">{title}</span>
        <span className="block text-xs opacity-70">{sub}</span>
      </span>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
        <Play className="h-4 w-4 fill-current" />
      </span>
    </>
  );

  return (
    <div>
      {action.kind === 'continue' ? (
        <Link to="/workout/active" className={className}>
          {body}
        </Link>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void (action.kind === 'scheduled' ? startScheduled(action.sessionId) : startToday())
          }
          className={className}
        >
          {body}
        </button>
      )}
      {error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
