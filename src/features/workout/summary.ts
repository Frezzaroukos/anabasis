import { isWorkingSet } from '@/lib/domain/setFilters';
import { totalVolume } from '@/lib/domain/volume';
import type { PersonalRecord, SetEntry } from '@/lib/db/types';

export interface WorkoutSummaryData {
  exercises: number;
  /** Σετ εργασίας (χωρίς warm-up). */
  sets: number;
  volumeKg: number;
  /** Μοναδικά ρεκόρ (άσκηση+τύπος) που σπάστηκαν σε αυτή την προπόνηση. */
  prs: number;
}

/**
 * Σύνοψη προπόνησης για τον διάλογο λήξης: καθαρά από τα ήδη φορτωμένα σετ + τα
 * ρεκόρ των ασκήσεών της. Μόνο πραγματικά δεδομένα — τίποτα εκτιμώμενο.
 */
export function summarizeWorkout(
  sets: ReadonlyArray<SetEntry>,
  prs: ReadonlyArray<Pick<PersonalRecord, 'exercise_id' | 'type' | 'deleted_at' | 'workout_id'>>,
  workoutId: string,
): WorkoutSummaryData {
  const working = sets.filter((s) => isWorkingSet(s));
  // «Νέο PR» = η προπόνηση έγραψε ρεκόρ ΠΑΝΩ από υπάρχον άλλης προπόνησης. Το
  // πρώτο σετ ποτέ μιας άσκησης αφήνει «βάση» στον πίνακα αλλά δεν είναι PR
  // (ίδιος κανόνας με το detectPRs / το κομφετί).
  const key = (p: { exercise_id: string | null; type: string }) => `${p.exercise_id ?? ''}:${p.type}`;
  const live = prs.filter((p) => p.deleted_at == null);
  const earlier = new Set(live.filter((p) => p.workout_id !== workoutId).map(key));
  const prKeys = new Set(live.filter((p) => p.workout_id === workoutId && earlier.has(key(p))).map(key));
  return {
    exercises: new Set(working.map((s) => s.exercise_id)).size,
    sets: working.length,
    volumeKg: totalVolume(working),
    prs: prKeys.size,
  };
}
