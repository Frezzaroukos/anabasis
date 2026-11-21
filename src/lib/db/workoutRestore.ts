/**
 * Επαναφορά (undo) διαγραφών σετ μέσα σε προπόνηση.
 *
 * Ξεχωριστό αρχείο από το `queries.ts` για τον ίδιο λόγο με το
 * `exerciseMerge.ts` / `workoutRestore` — το `queries.ts` είναι στο όριο
 * parse/size του oxc/rolldown (βλ. CLAUDE.md §9).
 *
 * Γιατί ξεχωριστά από το `softDeleteSet`: η διαγραφή είναι soft (tombstone,
 * sync-friendly). Η επαναφορά καθαρίζει τα tombstones και — κρίσιμο —
 * ΞΑΝΑΥΠΟΛΟΓΙΖΕΙ τα PR, επειδή η επαναφορά σετ μπορεί να ξανασπάσει ρεκόρ που
 * είχε πέσει όταν το σετ είχε σβηστεί.
 */
import { db } from './schema';
import { recomputePRsForExercise } from './queries';

const now = () => new Date().toISOString();

/**
 * Επαναφέρει ένα soft-deleted σετ (undo του `softDeleteSet`).
 * No-op αν το σετ δεν υπάρχει ή δεν είναι διαγραμμένο.
 */
export async function restoreSet(setId: string): Promise<void> {
  const set = await db.sets.get(setId);
  if (!set || set.deleted_at == null) return;
  const t = now();
  await db.sets.update(setId, { deleted_at: null, updated_at: t });
  await recomputePRsForExercise(set.exercise_id);
}

/**
 * Επαναφέρει ΟΛΑ τα soft-deleted σετ μιας άσκησης ΜΕΣΑ σε μια προπόνηση
 * (undo του `removeExerciseFromWorkout`). Δεν αγγίζει σετ άλλης προπόνησης.
 * Επιστρέφει πόσα σετ επαναφέρθηκαν (0 = τίποτα να κάνει).
 */
export async function restoreExerciseInWorkout(
  workoutId: string,
  exerciseId: string,
): Promise<number> {
  const sets = await db.sets
    .where('workout_id')
    .equals(workoutId)
    .and((s) => s.exercise_id === exerciseId && s.deleted_at != null)
    .toArray();
  if (sets.length === 0) return 0;
  const t = now();
  await db.sets
    .where('workout_id')
    .equals(workoutId)
    .and((s) => s.exercise_id === exerciseId && s.deleted_at != null)
    .modify({ deleted_at: null, updated_at: t });
  await recomputePRsForExercise(exerciseId);
  return sets.length;
}
