import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { queries } from '@/lib/db';
import { setWorkoutDuration, updateWorkoutDistance } from '@/lib/db/queries';
import { clearStopwatch } from '@/hooks/useManualStopwatch';
import { formatDurationInput, parseDurationInput } from '@/features/activities/duration';
import type { SessionFeel, Workout } from '@/lib/db/types';
import { useSessionTimer } from '@/hooks/useSessionTimer';
import { isDistanceTrackedActivity, formatPaceMinPerKm } from '../utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { getActivity } from '@/lib/db/queries';

interface ActivityLogFormProps {
  workout: Workout;
}

const FEELS: SessionFeel[] = [1, 2, 3, 4, 5];
const MAX_DISTANCE_KM = 1000;

/**
 * Το endWorkout διαβάζει το manual stopwatch από localStorage. Γράφουμε την
 * ίδια μορφή ώστε μια χειροκίνητη διάρκεια να μην αντικατασταθεί από wall-clock
 * όταν πατηθεί «Save workout». Το format ζει στο useManualStopwatch.
 */
function writeManualDuration(workoutId: string, seconds: number): void {
  try {
    globalThis.localStorage?.setItem(
      `anabasis.stopwatch.${workoutId}`,
      JSON.stringify({ acc: seconds * 1000, since: null }),
    );
  } catch {
    /* private mode */
  }
}

/**
 * Logger για δραστηριότητες χωρίς σετ (run/basketball/cycling/swim/mobility/
 * other) — διάρκεια (ζωντανό timer, ήδη στο header), προαιρετική απόσταση
 * με παράγωγο ρυθμό, feel και σημειώσεις.
 */
export function ActivityLogForm({ workout }: ActivityLogFormProps) {
  const { t } = useTranslation();
  const elapsedSeconds = useSessionTimer(workout.started_at);
  const [distance, setDistance] = useState(
    workout.distance_km != null ? String(workout.distance_km) : '',
  );
  const [distanceError, setDistanceError] = useState(false);
  const [duration, setDuration] = useState(
    workout.duration_seconds != null ? formatDurationInput(workout.duration_seconds) : '',
  );
  const [durationError, setDurationError] = useState(false);
  const [manualSeconds, setManualSeconds] = useState<number | null>(
    workout.duration_seconds ?? null,
  );
  const [notes, setNotes] = useState(workout.notes ?? '');

  // Sync local state when workout prop changes (e.g. after sync/update)
  useEffect(() => {
    setDistance(workout.distance_km != null ? String(workout.distance_km) : '');
    setNotes(workout.notes ?? '');
  }, [workout.distance_km, workout.notes]);

  useEffect(() => {
    setDuration(
      workout.duration_seconds != null ? formatDurationInput(workout.duration_seconds) : '',
    );
    setManualSeconds(workout.duration_seconds ?? null);
  }, [workout.duration_seconds]);

  const activity = useLiveQuery(
    () => getActivity(workout.activity_kind),
    [workout.activity_kind],
  );
  const showDistance = isDistanceTrackedActivity(activity, workout.activity_kind);
  const distanceParsed = (() => {
    const raw = distance.trim();
    if (!raw) return { value: null, invalid: false };
    const km = Number(raw.replace(',', '.'));
    if (!Number.isFinite(km) || km <= 0 || km > MAX_DISTANCE_KM) {
      return { value: null, invalid: true };
    }
    return { value: km, invalid: false };
  })();
  const paceSeconds = manualSeconds ?? elapsedSeconds;
  const pace =
    showDistance && distanceParsed.value != null && !distanceError
      ? formatPaceMinPerKm(paceSeconds, distanceParsed.value)
      : null;

  const onDistanceBlur = () => {
    const raw = distance.trim();
    if (!raw) {
      setDistanceError(false);
      void updateWorkoutDistance(workout.id, null);
      return;
    }
    if (distanceParsed.invalid || distanceParsed.value == null) {
      setDistanceError(true);
      return;
    }
    setDistanceError(false);
    void updateWorkoutDistance(workout.id, distanceParsed.value);
  };

  const onDurationBlur = () => {
    const raw = duration.trim();
    if (!raw) {
      setDurationError(false);
      setManualSeconds(null);
      clearStopwatch(workout.id);
      void setWorkoutDuration(workout.id, null);
      return;
    }
    const seconds = parseDurationInput(raw);
    if (seconds == null) {
      setDurationError(true);
      return;
    }
    setDurationError(false);
    setManualSeconds(seconds);
    setDuration(formatDurationInput(seconds));
    writeManualDuration(workout.id, seconds);
    void setWorkoutDuration(workout.id, seconds);
  };

  const onNotesBlur = () => {
    const trimmed = notes.trim();
    void queries.updateWorkoutMeta(workout.id, { notes: trimmed === '' ? null : trimmed });
  };

  const onFeelSelect = (feel: SessionFeel) => {
    void queries.updateWorkoutMeta(workout.id, { feel: workout.feel === feel ? null : feel });
  };

  return (
    <div className="space-y-5">
      {showDistance && (
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('workout.distanceKm')}
          </label>
          <Input
            inputMode="decimal"
            type="number"
            step="0.01"
            min="0"
            value={distance}
            onChange={(e) => {
              setDistance(e.target.value);
              setDistanceError(false);
            }}
            onBlur={onDistanceBlur}
            className="h-11 font-mono text-base tabular-nums"
            aria-label={t('workout.distanceKm')}
            aria-invalid={distanceError}
          />
          {distanceError && (
            <p role="alert" className="text-xs text-destructive">
              {t('activities.distanceInvalid')}
            </p>
          )}
          {pace && (
            <p className="text-xs text-muted-foreground">
              {t('workout.pace')}: <span className="font-mono tabular-nums">{pace}</span>
            </p>
          )}
        </div>
      )}

      {/* Χειροκίνητη διάρκεια: το timer είναι η προεπιλογή· εδώ γράφεις τον
          πραγματικό χρόνο («25», «25:30», «1:05:00») όταν ξέχασες να το πατήσεις. */}
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('workout.duration')}
        </label>
        <Input
          inputMode="text"
          value={duration}
          onChange={(e) => {
            setDuration(e.target.value);
            setDurationError(false);
          }}
          onBlur={onDurationBlur}
          placeholder={t('activities.durationPlaceholder')}
          aria-label={t('workout.duration')}
          aria-invalid={durationError}
          className="h-11 font-mono text-base tabular-nums"
        />
        {durationError ? (
          <p role="alert" className="text-xs text-destructive">
            {t('activities.durationInvalid')}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('activities.durationHint')}</p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('workout.feel')}
        </label>
        <div className="flex gap-2" role="radiogroup" aria-label={t('workout.feel')}>
          {FEELS.map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={workout.feel === f}
              onClick={() => onFeelSelect(f)}
              className={cn(
                'h-10 flex-1 rounded-md text-sm font-mono font-medium tabular-nums transition-colors active:scale-[0.97]',
                'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                workout.feel === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-elevated text-muted-foreground hover:text-foreground',
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('workout.notes')}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={onNotesBlur}
          rows={4}
          className="w-full rounded-md bg-elevated px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          placeholder={t('workout.notesPlaceholder')}
        />
      </div>
    </div>
  );
}
