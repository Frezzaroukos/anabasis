/**
 * Workout volume helpers (kg-based).
 * Volume = weight * reps, summed. Bodyweight-only sets count
 * bodyweight_kg as the load when present.
 */

import type { SetEntry } from '../db/types';

export function setVolume(
  s: Pick<SetEntry, 'weight_kg' | 'bodyweight_kg' | 'reps'> &
    Partial<Pick<SetEntry, 'rest_pause_reps'>>,
): number {
  const miniReps = s.rest_pause_reps?.reduce((sum, reps) => sum + reps, 0) ?? 0;
  const reps = (s.reps ?? 0) + miniReps;
  if (reps <= 0) return 0;
  const load = (s.weight_kg ?? 0) + (s.bodyweight_kg ?? 0);
  return load * reps;
}

export function totalVolume(sets: ReadonlyArray<
  Pick<SetEntry, 'weight_kg' | 'bodyweight_kg' | 'reps'> &
    Partial<Pick<SetEntry, 'rest_pause_reps'>>
>): number {
  return sets.reduce((acc, s) => acc + setVolume(s), 0);
}
