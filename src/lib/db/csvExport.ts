/**
 * CSV για Excel/Sheets — ΞΕΧΩΡΙΣΤΟ από το JSON backup.
 *
 * Το JSON είναι για επαναφορά· το CSV είναι για ανάλυση έξω από το app
 * (pivot tables, γραφήματα, δικό σου spreadsheet). Δύο αρχεία:
 *   - `exportWorkoutsCsv()` → μία γραμμή ανά προπόνηση
 *   - `exportSetsCsv()`     → μία γραμμή ανά σετ, με ημερομηνία/άσκηση
 *
 * Μόνο το τρέχον προφίλ και μόνο ζωντανές εγγραφές (soft-deleted rows δεν
 * ανήκουν σε «τα δεδομένα σου»). BOM στην αρχή ώστε το Excel να διαβάζει
 * σωστά ελληνικά ονόματα ασκήσεων.
 */
import { db } from './schema';
import { getCurrentUserId } from './session';
import { localDay } from './queries';
import { setVolume } from '../domain/volume';
import type { Exercise } from './types';

const BOM = '\uFEFF';

/** RFC 4180 escaping: quotes διπλασιάζονται, πεδία με , " ή newline μπαίνουν σε quotes. */
export function csvCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const line = (cells: unknown[]) => cells.map(csvCell).join(',');

async function exerciseNames(): Promise<Map<string, string>> {
  const rows = await db.exercises.toArray();
  return new Map(rows.map((e: Exercise) => [e.id, e.name]));
}

export async function exportWorkoutsCsv(userId: string = getCurrentUserId()): Promise<string> {
  const [workouts, allSets, activities] = await Promise.all([
    db.workouts.where('user_id').equals(userId).toArray(),
    db.sets.toArray(),
    db.activities.toArray(),
  ]);
  const activityLabel = new Map(activities.map((a) => [a.key, a.label]));

  const setCount = new Map<string, number>();
  for (const s of allSets) {
    if (s.deleted_at != null) continue;
    setCount.set(s.workout_id, (setCount.get(s.workout_id) ?? 0) + 1);
  }

  const rows = workouts
    .filter((w) => w.deleted_at == null && w.ended_at != null)
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .map((w) =>
      line([
        localDay(new Date(w.started_at)),
        w.workout_type ?? activityLabel.get(w.activity_kind) ?? w.activity_kind,
        activityLabel.get(w.activity_kind) ?? w.activity_kind,
        w.duration_seconds,
        w.distance_km,
        setCount.get(w.id) ?? 0,
        w.notes,
      ]),
    );

  return [
    BOM + line(['date', 'workout', 'activity', 'duration_seconds', 'distance_km', 'sets', 'notes']),
    ...rows,
  ].join('\n');
}

export async function exportSetsCsv(userId: string = getCurrentUserId()): Promise<string> {
  const [workouts, allSets, names] = await Promise.all([
    db.workouts.where('user_id').equals(userId).toArray(),
    db.sets.toArray(),
    exerciseNames(),
  ]);
  const workoutById = new Map(
    workouts.filter((w) => w.deleted_at == null).map((w) => [w.id, w]),
  );

  const rows = allSets
    .filter((s) => s.deleted_at == null && workoutById.has(s.workout_id))
    .sort((a, b) => {
      const wa = workoutById.get(a.workout_id)!;
      const wb = workoutById.get(b.workout_id)!;
      return (
        wa.started_at.localeCompare(wb.started_at) ||
        (names.get(a.exercise_id) ?? '').localeCompare(names.get(b.exercise_id) ?? '') ||
        a.set_number - b.set_number
      );
    })
    .map((s) => {
      const w = workoutById.get(s.workout_id)!;
      return line([
        localDay(new Date(w.started_at)),
        w.workout_type ?? w.activity_kind,
        names.get(s.exercise_id) ?? s.exercise_id,
        s.set_number,
        s.weight_kg,
        s.reps,
        s.hold_seconds,
        s.rpe,
        s.rir,
        s.set_type,
        Math.round(setVolume(s) * 10) / 10,
        s.notes,
      ]);
    });

  return [
    BOM +
      line([
        'date',
        'workout',
        'exercise',
        'set_number',
        'weight_kg',
        'reps',
        'hold_seconds',
        'rpe',
        'rir',
        'set_type',
        'volume',
        'notes',
      ]),
    ...rows,
  ].join('\n');
}
