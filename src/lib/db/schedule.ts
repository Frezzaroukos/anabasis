import { db } from './index';
import type { ProgramExercise, Workout } from './types';

/**
 * Το πλάνο μιας προπόνησης — οι γραμμές του προγράμματος που ΑΝΤΙΣΤΟΙΧΟΥΝ σε
 * αυτήν, με τη σειρά του προγράμματος.
 *
 * Υπάρχει επειδή η δομή του προγράμματος σταματούσε στη βάση: το
 * `startWorkoutFromProgramDay` επέστρεφε `plan`, αλλά ΚΑΝΕΝΑΣ caller δεν το
 * κρατούσε (Calendar/Programs απλά πλοηγούσαν στο /workout/active) και η οθόνη
 * καταγραφής δεν ρωτούσε ποτέ για πρόγραμμα. Αποτέλεσμα: διάλεγες «Upper» από
 * το ημερολόγιο, έπαιρνες σωστά ονομασμένη & συνδεδεμένη προπόνηση — και μετά
 * άδεια οθόνη, να ξαναπροσθέσεις 10 ασκήσεις με το χέρι, χωρίς κανέναν στόχο.
 *
 * Η αντιστοίχιση είναι δύο επιπέδων, γιατί έτσι είναι και το μοντέλο:
 *  · δεμένη σε ΜΕΡΑ → μόνο οι ασκήσεις εκείνης της μέρας·
 *  · δεμένη σε ΠΡΟΓΡΑΜΜΑ χωρίς μέρα → μόνο οι γραμμές χωρίς μέρα. Το φίλτρο
 *    `program_day_id == null` δεν είναι διακοσμητικό: χωρίς αυτό, ένα δομημένο
 *    πρόγραμμα που ξεκίνησε «ολόκληρο» θα ισοπέδωνε ΟΛΕΣ τις μέρες του σε μία
 *    λίστα. Το UI σήμερα το αποτρέπει, αλλά ο helper πρέπει να είναι σωστός
 *    από μόνος του.
 */
export async function getWorkoutPlan(
  workout: Pick<Workout, 'program_id' | 'program_day_id'> | null | undefined,
): Promise<ProgramExercise[]> {
  if (!workout?.program_id) return [];

  const rows = workout.program_day_id
    ? await db.program_exercises.where('program_day_id').equals(workout.program_day_id).toArray()
    : (await db.program_exercises.where('program_id').equals(workout.program_id).toArray()).filter(
        (row) => row.program_day_id == null,
      );

  return rows.sort((a, b) => a.position - b.position);
}

/** Πόσες ασκήσεις έχει μια μέρα προγράμματος — για να ξέρεις τι ξεκινάς. */
export async function countProgramDayExercises(dayId: string): Promise<number> {
  return db.program_exercises.where('program_day_id').equals(dayId).count();
}
