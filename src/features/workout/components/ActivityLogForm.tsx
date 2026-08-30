import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { queries } from '@/lib/db';
import type { SessionFeel, Workout } from '@/lib/db/types';
import { useSessionTimer } from '@/hooks/useSessionTimer';
import { isDistanceTrackedActivity, formatPaceMinPerKm } from '../utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { getActivity } from '@/lib/db/queries';

interface ActivityLogFormProps {
  workout: Workout;
}

const FEELS: SessionFeel[] = [1, 2, 3, 4, 5];

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
  const [notes, setNotes] = useState(workout.notes ?? '');

  const activity = useLiveQuery(
    () => getActivity(workout.activity_kind),
    [workout.activity_kind],
  );
  const showDistance = isDistanceTrackedActivity(activity, workout.activity_kind);
  const distanceKm = distance.trim() === '' ? null : Number(distance);
  const pace =
    showDistance && distanceKm != null && Number.isFinite(distanceKm)
      ? formatPaceMinPerKm(elapsedSeconds, distanceKm)
      : null;

  const onDistanceBlur = () => {
    const km = distance.trim() === '' ? null : Number(distance);
    void queries.updateWorkoutDistance(workout.id, km != null && Number.isFinite(km) ? km : null);
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
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('workout.distanceKm')}
          </label>
          <Input
            inputMode="decimal"
            type="number"
            step="0.01"
            min="0"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            onBlur={onDistanceBlur}
            className="h-11 font-mono text-base tabular-nums"
            aria-label={t('workout.distanceKm')}
          />
          {pace && (
            <p className="text-xs text-muted-foreground">
              {t('workout.pace')}: <span className="font-mono tabular-nums">{pace}</span>
            </p>
          )}
        </div>
      )}

      <div className="space-y-1">
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
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
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
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
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {t('workout.notes')}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={onNotesBlur}
          rows={4}
          className="w-full rounded-md bg-elevated px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          placeholder={t('workout.notesPlaceholder')}
        />
      </div>
    </div>
  );
}
