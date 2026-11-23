import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { getPreviousPRs } from '@/lib/db/queries';
import type { PersonalRecord, WeightUnit } from '@/lib/db/types';
import { prBodyChange, signedWeight } from '@/lib/domain/prFormat';

/**
 * «+2 kg συνολικό φορτίο · σώμα +2 kg» — μόνο όταν ένα ρεκόρ συνολικού φορτίου
 * ήρθε (και) από αλλαγή σωματικού βάρους. Τίποτα όταν δεν υπάρχει σύγκριση.
 */
export function PRBodyNote({
  pr,
  unit,
  className,
}: {
  pr: PersonalRecord;
  unit: WeightUnit;
  className?: string;
}) {
  const { t } = useTranslation();
  // Μόνο οι τύποι συνολικού φορτίου χρειάζονται σύγκριση — οι υπόλοιποι δεν κάνουν query.
  const needsPrev = pr.type === 'max_total_load' || pr.type === 'e1rm_total';
  const prev = useLiveQuery(
    () => (needsPrev ? getPreviousPRs([pr]).then((m) => m.get(pr.id)) : undefined),
    [pr.id, needsPrev],
  );
  const change = prBodyChange(pr, prev);
  if (!change) return null;
  return (
    <span className={className ?? 'block text-[11px] text-muted-foreground'}>
      {t('history.prBody.total', { delta: signedWeight(change.valueDeltaKg, unit) })} ·{' '}
      {t('history.prBody.body', { delta: signedWeight(change.bodyDeltaKg, unit) })}
      {change.estimated ? ` ≈ ${t('history.prBody.estimated')}` : ''}
    </span>
  );
}
