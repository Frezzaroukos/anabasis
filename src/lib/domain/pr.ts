/**
 * PR detection helpers — pure, given a candidate set + history.
 *
 * Note: callers materialize the result into the personal_records table.
 * This module just decides "is the candidate a new record?".
 */

import type { PersonalRecord, PRType, SetEntry } from '../db/types';
import { epley } from './e1rm';
import { setVolume } from './volume';

export interface PRCandidate {
  type: PRType;
  value: number;
  reps: number | null;
  weight_kg: number | null;
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

export function isNewPR(
  candidate: PRCandidate,
  current: Pick<PersonalRecord, 'type' | 'value'> | null,
): boolean {
  if (!current) return true;
  if (current.type !== candidate.type) return true;
  return candidate.value > current.value;
}
