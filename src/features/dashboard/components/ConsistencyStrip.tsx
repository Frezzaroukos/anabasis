import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { getTrainingSummary } from '@/lib/db/queries';

/**
 * Λεπτή γραμμή συνέπειας — σκόπιμα ΟΧΙ κάρτα.
 *
 * Το heatmap από πάνω δείχνει ήδη την ίδια ιδέα οπτικά· ένα δεύτερο κουτί με
 * τα ίδια νούμερα θα ήταν επανάληψη. Μετρά ενεργές μέρες (συμπεριλαμβάνει
 * και προπόνηση σε εξέλιξη), σε αντίθεση με το heatmap που μετρά μόνο
 * ολοκληρωμένες — γι' αυτό ζει χωριστά και όχι μέσα του.
 */
export function ConsistencyStrip() {
  const { t } = useTranslation();
  const summary7 = useLiveQuery(() => getTrainingSummary(7), [], null);
  const summary30 = useLiveQuery(() => getTrainingSummary(30), [], null);

  if (!summary7 || !summary30 || summary30.totalSets === 0) return null;

  return (
    <div className="flex items-center gap-5 px-1 text-xs text-muted-foreground">
      <span className="font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
        {t('dashboard.consistency')}
      </span>
      <span>
        {t('dashboard.last7days')}{' '}
        <span className="font-mono text-foreground">{summary7.activeDays}/7</span>
      </span>
      <span>
        {t('dashboard.last30days')}{' '}
        <span className="font-mono text-foreground">{summary30.activeDays}/30</span>
      </span>
    </div>
  );
}
