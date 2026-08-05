/**
 * PR detection helpers — pure, given a candidate set + history.
 *
 * Note: callers materialize the result into the personal_records table.
 * This module just decides "is the candidate a new record?".
 */

import type { PersonalRecord, PRType, SetEntry, Workout } from '../db/types';
import { epley } from './e1rm';
import { setVolume } from './volume';

export interface PRCandidate {
  type: PRType;
  value: number;
  reps: number | null;
  weight_kg: number | null;
  /** «καλύτερο» σημαίνει μεγαλύτερο (βάρος) ή μικρότερο (ρυθμός) — default 'higher' */
  direction?: 'higher' | 'lower';
}

export function candidatesFromSet(set: SetEntry): PRCandidate[] {
  const candidates: PRCandidate[] = [];

  if (set.weight_kg != null && set.reps != null && set.reps > 0) {
    candidates.push({
      type: 'max_weight',
      value: set.weight_kg,
      reps: set.reps,
      weight_kg: set.weight_kg,
    });
    candidates.push({
      type: 'max_reps',
      value: set.reps,
      reps: set.reps,
      weight_kg: set.weight_kg,
    });
    candidates.push({
      type: 'e1rm',
      value: epley(set.weight_kg, set.reps),
      reps: set.reps,
      weight_kg: set.weight_kg,
    });
    candidates.push({
      type: 'max_volume',
      value: setVolume(set),
      reps: set.reps,
      weight_kg: set.weight_kg,
    });
  }

  if (set.hold_seconds != null && set.hold_seconds > 0) {
    candidates.push({
      type: 'max_hold',
      value: set.hold_seconds,
      reps: null,
      weight_kg: set.weight_kg,
    });
  }

  return candidates;
}

/**
 * PR candidates για δραστηριότητες χωρίς σετ (τρέξιμο/ποδήλατο/κολύμβηση).
 * Ο ρυθμός (πιο αργός = χειρότερος) είναι η μόνη μετρική με 'lower' direction
 * σε όλο το PR σύστημα — γι' αυτό υπάρχει το πεδίο `direction`.
 */
export function candidatesFromWorkout(
  w: Pick<Workout, 'distance_km' | 'duration_seconds'>,
): PRCandidate[] {
  const candidates: PRCandidate[] = [];

  if (w.distance_km != null && w.distance_km > 0) {
    candidates.push({
      type: 'longest_distance',
      value: w.distance_km,
      reps: null,
      weight_kg: null,
    });
    if (w.duration_seconds != null && w.duration_seconds > 0) {
      candidates.push({
        type: 'fastest_pace',
        value: w.duration_seconds / w.distance_km,
        reps: null,
        weight_kg: null,
        direction: 'lower',
      });
    }
  } else if (w.duration_seconds != null && w.duration_seconds > 0) {
    // διάρκεια χωρίς απόσταση (π.χ. κολύμβηση χωρίς GPS) — ακόμα αξίζει PR
    candidates.push({
      type: 'longest_duration',
      value: w.duration_seconds,
      reps: null,
      weight_kg: null,
    });
  }

  return candidates;
}

export function isNewPR(
  candidate: PRCandidate,
  current: Pick<PersonalRecord, 'type' | 'value'> | null,
): boolean {
  if (!current) return true;
  if (current.type !== candidate.type) return true;
  return candidate.direction === 'lower'
    ? candidate.value < current.value
    : candidate.value > current.value;
}
