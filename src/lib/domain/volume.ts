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
  const reps = setReps(s);
  if (reps <= 0) return 0;
  const load = (s.weight_kg ?? 0) + (s.bodyweight_kg ?? 0);
  return load * reps;
}

/**
 * Συνολικές επαναλήψεις ενός σετ = κύριες + mini-reps του rest-pause.
 * Ένας ορισμός για όλη την εφαρμογή: το volume (`setVolume`) και ο στόχος
 * επαναλήψεων πρέπει να μετράνε το ίδιο πράγμα — αλλιώς ένα σετ 5+3+2 κλείνει
 * διαφορετικό ποσοστό στους δύο στόχους.
 */
export function setReps(
  s: Pick<SetEntry, 'reps'> & Partial<Pick<SetEntry, 'rest_pause_reps'>>,
): number {
  const miniReps = s.rest_pause_reps?.reduce((sum, reps) => sum + reps, 0) ?? 0;
  return (s.reps ?? 0) + miniReps;
}

export function totalVolume(sets: ReadonlyArray<
  Pick<SetEntry, 'weight_kg' | 'bodyweight_kg' | 'reps'> &
    Partial<Pick<SetEntry, 'rest_pause_reps'>>
>): number {
  return sets.reduce((acc, s) => acc + setVolume(s), 0);
}
