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
  updateWorkoutDistance,
  updateWorkoutMeta,
} from '@/lib/db/queries';
import type { Workout } from '@/lib/db/types';
import { BottomSheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ActivityChip } from '@/components/ActivityChip';
import { useToast } from '@/components/ui/toast-context';
import { formatDurationInput, parseDurationInput } from '@/features/activities/duration';
import { formatPaceMinPerKm } from '@/features/workout/utils';

/** Λογικό όριο απόστασης — ίδιο με τον logger (ActivityLogForm). */
const MAX_DISTANCE_KM = 1000;

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
  const [durationText, setDurationText] = useState('');
  const [distanceText, setDistanceText] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [timeError, setTimeError] = useState(false);
  const [durationError, setDurationError] = useState(false);
  const [distanceError, setDistanceError] = useState(false);

  // Η δραστηριότητα που διαλέγει ο χρήστης (για tracks_distance / uses_sets).
  const selectedActivity = activities.find((a) => a.key === kind);
  const showDistance = selectedActivity
    ? selectedActivity.tracks_distance
    : kind === 'run' || kind === 'cycling' || kind === 'swim';

  // Απόσταση: δέχεται κόμμα ή τελεία. null = κενό, invalid = μη-θετικό/υπερβολικό.
  const distanceParsed = (() => {
    const raw = distanceText.trim();
    if (!raw) return { value: null as number | null, invalid: false };
    const km = Number(raw.replace(',', '.'));
    if (!Number.isFinite(km) || km <= 0 || km > MAX_DISTANCE_KM) {
      return { value: null as number | null, invalid: true };
    }
    return { value: km, invalid: false };
  })();

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
    setDurationText(
      workout.duration_seconds != null ? formatDurationInput(workout.duration_seconds) : '',
    );
    setDistanceText(workout.distance_km != null ? String(workout.distance_km) : '');
    setNotes(workout.notes ?? '');
    setConfirmingDelete(false);
    setTimeError(false);
    setDurationError(false);
    setDistanceError(false);
  }, [open, workout]);

  // Ζωντανή προεπισκόπηση pace (min/km) — ίδιος υπολογισμός με τον logger.
  const paceSeconds = (() => {
    const parsed = parseDurationInput(durationText);
    if (parsed != null) return parsed;
    return workout.duration_seconds ?? null;
  })();
  const pace =
    showDistance && distanceParsed.value != null && !distanceError && paceSeconds != null
      ? formatPaceMinPerKm(paceSeconds, distanceParsed.value)
      : null;

  const save = async () => {
    // Validation πρώτα: άκυρη διάρκεια/απόσταση δεν αποθηκεύεται, δείχνει μήνυμα.
    setDurationError(false);
    setDistanceError(false);
    const durationSeconds = durationText.trim() === '' ? null : parseDurationInput(durationText);
    if (durationText.trim() !== '' && durationSeconds == null) {
      setDurationError(true);
      return;
    }
    if (showDistance && distanceParsed.invalid) {
      setDistanceError(true);
      return;
    }

    // Η ώρα προηγείται της διάρκειας: αν δοθεί λήξη, η διάρκεια υπολογίζεται
    // από τη διαφορά και το πεδίο «διάρκειας» δεν χρειάζεται να την πατήσει.
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
    // Διάρκεια (h:mm:ss). Παρακάμπτεται αν μόλις όρισες λήξη (τότε ισχύει η διαφορά).
    if (!endEdited && durationSeconds !== (workout.duration_seconds ?? null)) {
      await setWorkoutDuration(workout.id, durationSeconds);
    }
    if (showDistance) {
      const nextDist = distanceParsed.value;
      if (nextDist !== (workout.distance_km ?? null)) {
        await updateWorkoutDistance(workout.id, nextDist);
      }
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

        {/* Απόσταση — μόνο για δραστηριότητες που μετρούν απόσταση. */}
        {showDistance && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('workout.distanceKm')}
            </span>
            <Input
              type="text"
              inputMode="decimal"
              value={distanceText}
              onChange={(e) => {
                setDistanceError(false);
                setDistanceText(e.target.value);
              }}
              placeholder="5.5"
              className="h-10 font-mono tabular-nums"
              aria-label={t('workout.distanceKm')}
              aria-invalid={distanceError}
            />
            {distanceError && (
              <p role="alert" className="text-xs text-destructive">
                {t('activities.distanceInvalid')}
              </p>
            )}
          </label>
        )}

        {/* Διάρκεια σε h:mm:ss («25», «25:30», «1:05:00»). Αν όρισες λήξη, η
            διάρκεια υπολογίζεται από τη διαφορά. */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('history.workoutDuration')}
          </span>
          <Input
            inputMode="text"
            value={durationText}
            onChange={(e) => {
              setDurationError(false);
              setDurationText(e.target.value);
            }}
            placeholder={t('activities.durationPlaceholder')}
            className="h-10 font-mono tabular-nums"
            aria-label={t('history.workoutDuration')}
            aria-invalid={durationError}
          />
          {durationError && (
            <p role="alert" className="text-xs text-destructive">
              {t('activities.durationInvalid')}
            </p>
          )}
        </label>

        {/* Ζωντανή προεπισκόπηση pace (min/km). */}
        {pace && (
          <p className="text-xs text-muted-foreground">
            {t('workout.pace')}: <span className="font-mono tabular-nums">{pace}</span>
          </p>
        )}

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
