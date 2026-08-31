import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2 } from 'lucide-react';
import {
  listActivities,
  localDay,
  setWorkoutActivity,
  setWorkoutDate,
  setWorkoutDuration,
  setWorkoutType,
  softDeleteWorkout,
} from '@/lib/db/queries';
import type { Workout } from '@/lib/db/types';
import { BottomSheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ActivityChip } from '@/components/ActivityChip';

/**
 * Διόρθωση μιας καταγεγραμμένης προπόνησης.
 *
 * Έλειπε εντελώς: μπορούσες να προσθέσεις προπόνηση σε μια μέρα αλλά όχι να
 * τη διορθώσεις ή να τη σβήσεις — και η λάθος καταχώριση είναι ο κανόνας, όχι
 * η εξαίρεση (πατάς λάθος μέρα, λάθος άθλημα, ή απλά δεν έγινε).
 *
 * Η διαγραφή ζητά επιβεβαίωση μέσα στο ίδιο φύλλο αντί για διάλογο: σε κινητό
 * ένα δεύτερο modal πάνω από φύλλο είναι εύκολο να το πατήσεις κατά λάθος.
 */
export function EditWorkoutSheet({
  open,
  onClose,
  workout,
}: {
  open: boolean;
  onClose: () => void;
  workout: Workout;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activities = useLiveQuery(() => listActivities(true), [], []);

  const [label, setLabel] = useState('');
  const [kind, setKind] = useState(workout.activity_kind);
  const [day, setDay] = useState(localDay(new Date(workout.started_at)));
  const [minutes, setMinutes] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const initialMinutes = (w: Workout) =>
    w.duration_seconds != null ? String(Math.round(w.duration_seconds / 60)) : '';

  useEffect(() => {
    if (!open) return;
    setLabel(workout.workout_type ?? '');
    setKind(workout.activity_kind);
    setDay(localDay(new Date(workout.started_at)));
    setMinutes(initialMinutes(workout));
    setConfirmingDelete(false);
  }, [open, workout]);

  const save = async () => {
    // Γράφουμε μόνο ό,τι άλλαξε — κάθε update σφραγίζει updated_at, και δεν
    // θέλουμε να «αγγίζουμε» πεδία που ο χρήστης δεν πείραξε.
    if ((workout.workout_type ?? '') !== label.trim()) {
      await setWorkoutType(workout.id, label.trim() || null);
    }
    if (workout.activity_kind !== kind) await setWorkoutActivity(workout.id, kind);
    if (localDay(new Date(workout.started_at)) !== day) await setWorkoutDate(workout.id, day);
    if (minutes.trim() !== initialMinutes(workout)) {
      const mins = Number(minutes);
      await setWorkoutDuration(
        workout.id,
        minutes.trim() !== '' && Number.isFinite(mins) && mins > 0 ? mins * 60 : null,
      );
    }
    onClose();
  };

  const remove = async () => {
    await softDeleteWorkout(workout.id);
    onClose();
    navigate('/history', { replace: true });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t('history.editWorkout')}>
      <div className="space-y-5 px-4 pb-6">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('history.workoutName')}
          </span>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('workout.typePlaceholder')}
            className="h-10"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('workout.activityKind')}
          </span>
          <div className="flex flex-wrap gap-2">
            {activities.map((a) => (
              <ActivityChip
                key={a.key}
                activity={a}
                selected={kind === a.key}
                onClick={() => setKind(a.key)}
              />
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('history.workoutDate')}
          </span>
          <input
            type="date"
            value={day}
            max={localDay()}
            onChange={(e) => setDay(e.target.value || day)}
            className="h-10 w-full rounded-md bg-elevated px-3 font-mono text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </label>

        {/* Χειροκίνητη διάρκεια — προαιρετική. Δεν χρειάζεται ζωντανό χρονόμετρο·
            γράψε πόσα λεπτά κράτησε, ή άφησέ το κενό. */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('history.workoutDuration')}
          </span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder={t('history.workoutDurationPlaceholder')}
            className="h-10 font-mono tabular-nums"
          />
        </label>

        <Button className="w-full" onClick={() => void save()}>
          {t('common.save')}
        </Button>

        <div className="border-t border-border/60 pt-4">
          {confirmingDelete ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('history.deleteConfirmTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('history.deleteConfirmDesc')}</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmingDelete(false)}>
                  {t('common.cancel')}
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => void remove()}>
                  {t('common.delete')}
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="flex w-full items-center justify-center gap-2 rounded-md py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              {t('history.deleteWorkout')}
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
