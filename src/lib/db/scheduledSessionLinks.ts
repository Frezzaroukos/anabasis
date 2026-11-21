/**
 * Μικρές, χωρίς-κύκλο ενημερώσεις στη σύνδεση scheduled_session ↔ workout.
 *
 * Ζουν ξεχωριστά επειδή τόσο το `queries.ts` (endWorkout/softDeleteWorkout) όσο
 * και το `scheduledSessions.ts` (start/CRUD) τα χρειάζονται. Αν το
 * `scheduledSessions.ts` εισήγαγε το `queries.ts` και το αντίστροφο, θα είχαμε
 * circular import.
 */

import { db } from './index';
import { getCurrentUserId } from './session';

/**
 * Όταν μια προπόνηση ολοκληρωθεί, η προγραμματισμένη εγγραφή που τη γέννησε
 * γίνεται `done`. Το `workout_id` παραμένει για ιστορικό/undo.
 */
export async function markScheduledDoneForWorkout(
  workoutId: string,
  updatedAt: string,
): Promise<void> {
  await db.scheduled_sessions
    .where('user_id')
    .equals(getCurrentUserId())
    .filter((s) => s.workout_id === workoutId && s.deleted_at == null && s.status !== 'done')
    .modify({ status: 'done', updated_at: updatedAt });
}

/**
 * Αν η προπόνηση διαγραφεί (λάθος καταχώριση), η προγραμματισμένη εγγραφή δεν
 * πρέπει να μείνει «done» για μια προπόνηση που δεν υπάρχει — επιστρέφει σε
 * `planned`. Το `workout_id` ΔΕΝ καθαρίζεται: είναι η μόνη απόδειξη της
 * σύνδεσης, ώστε το Undo (`restoreWorkout`) να μπορεί να την επαναφέρει σε
 * `done` χωρίς να μαντέψει ποιο planned row ανήκε σε ποια προπόνηση.
 */
export async function revertScheduledForWorkout(
  workoutId: string,
  updatedAt: string,
): Promise<void> {
  await db.scheduled_sessions
    .where('user_id')
    .equals(getCurrentUserId())
    .filter((s) => s.workout_id === workoutId && s.deleted_at == null)
    .modify({ status: 'planned', updated_at: updatedAt });
}

/**
 * Undo διαγραφής προπόνησης: ό,τι planned row είχε αυτό το `workout_id` (πριν
 * ή μετά το revert) ξαναγίνεται `done` — ή `planned` αν η προπόνηση δεν είχε
 * ολοκληρωθεί πριν διαγραφεί. Το status δίνεται από τον caller ώστε να
 * ταιριάζει με την πραγματική κατάσταση του workout (`ended_at`).
 */
export async function relinkScheduledForWorkout(
  workoutId: string,
  updatedAt: string,
  status: 'planned' | 'done' = 'done',
): Promise<void> {
  await db.scheduled_sessions
    .where('user_id')
    .equals(getCurrentUserId())
    .filter((s) => s.workout_id === workoutId && s.deleted_at == null)
    .modify({ status, updated_at: updatedAt });
}
