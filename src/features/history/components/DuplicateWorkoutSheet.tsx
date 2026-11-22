import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { BottomSheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { duplicateWorkoutToDate, localDay } from '@/lib/db/queries';

/**
 * Αντιγραφή μιας ολοκληρωμένης προπόνησης σε άλλη ημερομηνία («ξέχασα να την
 * καταγράψω χθες»). Δημιουργεί πλήρες αντίγραφο με όλα τα σετ, ως ολοκληρωμένη
 * συνεδρία. Μετά την αντιγραφή πλοηγείται στο αντίγραφο ώστε ο χρήστης να το
 * δει/διορθώσει αμέσως.
 */
export function DuplicateWorkoutSheet({
  open,
  onClose,
  workoutId,
  onCopied,
}: {
  open: boolean;
  onClose: () => void;
  workoutId: string;
  onCopied: (newId: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [date, setDate] = useState(localDay());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const copy = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const newId = await duplicateWorkoutToDate(workoutId, date);
      if (!newId) {
        setError(true);
        return;
      }
      onCopied(newId);
      onClose();
      navigate(`/history/${newId}`, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t('history.duplicateTitle')}>
      <div className="space-y-4 px-4 pb-6">
        <p className="text-sm text-muted-foreground">{t('history.duplicateDesc')}</p>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('history.workoutDate')}
          </span>
          <input
            type="date"
            value={date}
            max={localDay()}
            onChange={(e) => {
              setError(false);
              setDate(e.target.value || date);
            }}
            className="h-11 w-full rounded-md bg-elevated px-3 font-mono text-sm tabular-nums transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t('history.duplicateExists')}
          </p>
        )}
        <Button className="w-full" disabled={busy} onClick={() => void copy()}>
          {t('history.duplicateAction')}
        </Button>
      </div>
    </BottomSheet>
  );
}
