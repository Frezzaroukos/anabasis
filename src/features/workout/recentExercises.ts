import { db } from '@/lib/db';
import { getCurrentUserId } from '@/lib/db/session';

/**
 * Τα id των ασκήσεων που έκανες πιο πρόσφατα (πιο πρόσφατη πρώτη, μοναδικά).
 * Τροφοδοτεί το «Πρόσφατες» στον επιλογέα ασκήσεων: 1 tap αντί για
 * πληκτρολόγηση + tap. Διαβάζει προπονήσεις από τη νεότερη προς την παλαιότερη
 * και σταματά μόλις μαζέψει `limit` ασκήσεις — όχι σάρωση όλου του ιστορικού.
 */
export async function getRecentExerciseIds(limit = 6): Promise<string[]> {
  const workouts = (await db.workouts.where('user_id').equals(getCurrentUserId()).toArray())
    .filter((w) => w.deleted_at == null)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const w of workouts) {
    const sets = (await db.sets.where('workout_id').equals(w.id).toArray())
      .filter((s) => s.deleted_at == null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    for (const s of sets) {
      if (seen.has(s.exercise_id)) continue;
      seen.add(s.exercise_id);
      out.push(s.exercise_id);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
