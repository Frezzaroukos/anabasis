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
 * `planned` και αποσυνδέεται, ώστε να ξαναξεκινήσει.
 */
export async function revertScheduledForWorkout(
  workoutId: string,
  updatedAt: string,
): Promise<void> {
  await db.scheduled_sessions
    .where('user_id')
    .equals(getCurrentUserId())
    .filter((s) => s.workout_id === workoutId && s.deleted_at == null)
    .modify({ workout_id: null, status: 'planned', updated_at: updatedAt });
}
