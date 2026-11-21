import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2 } from 'lucide-react';
import {
  listActivities,
  localDay,
  restoreWorkout,
  setWorkoutActivity,
  setWorkoutDate,
  setWorkoutDuration,
  setWorkoutTimes,
  setWorkoutType,
  softDeleteWorkout,
  updateWorkoutMeta,
} from '@/lib/db/queries';
import type { Workout } from '@/lib/db/types';
import { BottomSheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ActivityChip } from '@/components/ActivityChip';
import { useToast } from '@/components/ui/toast-context';

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
  const { showToast } = useToast();
  const activities = useLiveQuery(() => listActivities(true), [], []);

  const [label, setLabel] = useState('');
  const [kind, setKind] = useState(workout.activity_kind);
  const [day, setDay] = useState(localDay(new Date(workout.started_at)));
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [minutes, setMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [timeError, setTimeError] = useState(false);

  const initialMinutes = (w: Workout) =>
    w.duration_seconds != null ? String(Math.round(w.duration_seconds / 60)) : '';

  const hhmm = (iso: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!open) return;
    setLabel(workout.workout_type ?? '');
    setKind(workout.activity_kind);
    setDay(localDay(new Date(workout.started_at)));
    setStartTime(hhmm(workout.started_at));
    setEndTime(hhmm(workout.ended_at));
    setMinutes(initialMinutes(workout));
    setNotes(workout.notes ?? '');
    setConfirmingDelete(false);
    setTimeError(false);
  }, [open, workout]);

  const save = async () => {
    // Η ώρα προηγείται της διάρκειας: αν δοθεί λήξη, η διάρκεια υπολογίζεται
    // από τη διαφορά και το πεδίο «λεπτά» δεν χρειάζεται να την πατήσει.
    const origStart = hhmm(workout.started_at);
    const origEnd = hhmm(workout.ended_at);
    const timeChanged = startTime !== origStart || endTime !== origEnd;
    let endEdited = false;
    if (timeChanged) {
      const ok = await setWorkoutTimes(workout.id, {
        start: startTime.trim() || null,
        end: endTime.trim() || null,
      });
      if (!ok) {
        setTimeError(true);
        return;
      }
      endEdited = endTime.trim() !== origEnd && endTime.trim() !== '';
    }
    // Γράφουμε μόνο ό,τι άλλαξε — κάθε update σφραγίζει updated_at, και δεν
    // θέλουμε να «αγγίζουμε» πεδία που ο χρήστης δεν πείραξε.
    if ((workout.workout_type ?? '') !== label.trim()) {
      await setWorkoutType(workout.id, label.trim() || null);
    }
    if (workout.activity_kind !== kind) await setWorkoutActivity(workout.id, kind);
    if (localDay(new Date(workout.started_at)) !== day) await setWorkoutDate(workout.id, day);
    // Χειροκίνητη διάρκεια — παράκαμπτεται αν μόλις όρισες λήξη (τότε ισχύει η διαφορά).
    if (!endEdited && minutes.trim() !== initialMinutes(workout)) {
      const mins = Number(minutes);
      await setWorkoutDuration(
        workout.id,
        minutes.trim() !== '' && Number.isFinite(mins) && mins > 0 ? mins * 60 : null,
      );
    }
    if ((workout.notes ?? '') !== notes.trim()) {
      await updateWorkoutMeta(workout.id, { notes: notes.trim() || null });
    }
    onClose();
  };

  const remove = async () => {
    await softDeleteWorkout(workout.id);
    onClose();
    navigate('/history', { replace: true });
    showToast({
      message: t('history.deletedToast'),
      actionLabel: t('history.undo'),
      onAction: () => {
        void restoreWorkout(workout.id).then(() => navigate(`/history/${workout.id}`, { replace: true }));
      },
      durationMs: 7000,
    });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t('history.editWorkout')}>
      <div className="space-y-5 px-4 pb-6">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
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
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
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
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('history.workoutDate')}
          </span>
          <input
            type="date"
            value={day}
            max={localDay()}
            onChange={(e) => setDay(e.target.value || day)}
            className="h-10 w-full rounded-md bg-elevated px-3 font-mono text-sm tabular-nums transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('history.workoutStartTime')}
            </span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => {
                setTimeError(false);
                setStartTime(e.target.value);
              }}
              className="h-10 w-full rounded-md bg-elevated px-3 font-mono text-sm tabular-nums transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('history.workoutEndTime')}
            </span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => {
                setTimeError(false);
                setEndTime(e.target.value);
              }}
              className="h-10 w-full rounded-md bg-elevated px-3 font-mono text-sm tabular-nums transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </label>
        </div>
        {timeError && (
          <p role="alert" className="text-sm text-destructive">
            {t('history.timeInvalid')}
          </p>
        )}

        {/* Χειροκίνητη διάρκεια — προαιρετική. Δεν χρειάζεται ζωντανό χρονόμετρο·
            γράψε πόσα λεπτά κράτησε, ή άφησέ το κενό. Αν όρισες λήξη, η
            διάρκεια υπολογίζεται από τη διαφορά. */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
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

        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('history.workoutNotes')}
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('workout.notesPlaceholder')}
            rows={3}
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
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
