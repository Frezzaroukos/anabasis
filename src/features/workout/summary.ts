import { isWorkingSet } from '@/lib/domain/setFilters';
import { totalVolume } from '@/lib/domain/volume';
import { realPRs } from '@/lib/domain/prBaseline';
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
  prs: ReadonlyArray<Pick<PersonalRecord, 'exercise_id' | 'activity_kind' | 'type' | 'deleted_at' | 'workout_id' | 'achieved_at'>>,
  workoutId: string,
): WorkoutSummaryData {
  const working = sets.filter((s) => isWorkingSet(s));
  // «Νέο PR» = ρεκόρ ΠΑΝΩ από υπάρχον ΠΡΟΗΓΟΥΜΕΝΗΣ προπόνησης — ενιαίος
  // ορισμός με όλους τους readers (lib/domain/prBaseline): το πρώτο σετ ποτέ μιας
  // άσκησης αφήνει «βάση» στον πίνακα αλλά δεν είναι PR.
  const key = (p: { exercise_id: string | null; type: string }) => `${p.exercise_id ?? ''}:${p.type}`;
  const prKeys = new Set(
    realPRs(prs)
      .filter((p) => p.workout_id === workoutId)
      .map(key),
  );
  return {
    exercises: new Set(working.map((s) => s.exercise_id)).size,
    sets: working.length,
    volumeKg: totalVolume(working),
    prs: prKeys.size,
  };
}
