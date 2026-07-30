import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { queries } from '@/lib/db';
import type { SessionFeel, Workout } from '@/lib/db/types';
import { useSessionTimer } from '@/hooks/useSessionTimer';
import { DISTANCE_ACTIVITY_KINDS, formatPaceMinPerKm } from '../utils';

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

  const showDistance = DISTANCE_ACTIVITY_KINDS.includes(workout.activity_kind);
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
            className="h-11 text-base"
            aria-label={t('workout.distanceKm')}
          />
          {pace && <p className="text-xs text-muted-foreground">{t('workout.pace')}: {pace}</p>}
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
                'h-10 flex-1 rounded-md border border-border text-sm font-medium transition-colors',
                workout.feel === f ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
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
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder={t('workout.notesPlaceholder')}
        />
      </div>
    </div>
  );
}
