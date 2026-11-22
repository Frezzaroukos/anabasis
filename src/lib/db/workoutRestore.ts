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
import { recomputePRsForExercise, renumberSetsForExercise } from './queries';

const now = () => new Date().toISOString();

/**
 * Επαναφέρει ένα soft-deleted σετ (undo του `softDeleteSet`).
 * No-op αν το σετ δεν υπάρχει ή δεν είναι διαγραμμένο.
 *
 * ⚠️ Σύγκρουση με το renumber: το `softDeleteSet` ξαναριθμεί τα υπόλοιπα σετ
 * 1..N, οπότε το σετ επιστρέφει με το ΠΑΛΙΟ του `set_number` και θα συγκρουστεί
 * (π.χ. #1,#2,#3 → σβήνω #2 → μένουν #1,#2 → undo → #1,#2,#2). Άρα πριν την
 * επαναφορά σπρώχνουμε +1 όλα τα ζωντανά σετ της ίδιας άσκησης/προπόνησης με
 * `set_number >= του αποκατεστημένου`, ώστε να ανοίξει «θέση», και μετά
 * ξαναριθμούμε 1..N.
 */
export async function restoreSet(setId: string): Promise<void> {
  const set = await db.sets.get(setId);
  if (!set || set.deleted_at == null) return;
  const t = now();
  await db.transaction('rw', db.sets, async () => {
    await db.sets
      .where('workout_id')
      .equals(set.workout_id)
      .and(
        (s) =>
          s.id !== setId &&
          s.exercise_id === set.exercise_id &&
          s.deleted_at == null &&
          s.set_number >= set.set_number,
      )
      .modify((s) => {
        s.set_number += 1;
        s.updated_at = t;
      });
    await db.sets.update(setId, { deleted_at: null, updated_at: t });
    await renumberSetsForExercise(set.workout_id, set.exercise_id);
  });
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
  // Το undo της αφαίρεσης άσκησης σφραγίζει όλα τα ζωντανά σετ με το ίδιο
  // timestamp. Παλιότερα tombstones (μεμονωμένο delete) μένουν σβησμένα.
  const stamp = sets.reduce(
    (latest, set) => ((set.deleted_at ?? '') > latest ? set.deleted_at! : latest),
    sets[0]!.deleted_at ?? '',
  );
  const cohort = sets.filter((s) => s.deleted_at === stamp);
  const t = now();
  await db.transaction('rw', db.sets, async () => {
    // Μόνο το cohort της τελευταίας αφαίρεσης· παλιότερα tombstones μένουν.
    await db.sets
      .where('workout_id')
      .equals(workoutId)
      .and((s) => s.exercise_id === exerciseId && s.deleted_at === stamp)
      .modify({ deleted_at: null, updated_at: t });
    // Το renumber εγγυάται πυκνή 1..N σειρά ακόμη κι αν υπάρχουν ήδη ζωντανά
    // σετ της ίδιας άσκησης (π.χ. μερικό delete).
    await renumberSetsForExercise(workoutId, exerciseId);
  });
  await recomputePRsForExercise(exerciseId);
  return cohort.length;
}
