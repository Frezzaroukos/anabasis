import { db } from './index';
import type { ProgramDay, ProgramExercise, Workout } from './types';

/**
 * Η επόμενη μέρα ενός structured προγράμματος: πρώτα εκείνη με τις λιγότερες
 * ολοκληρωμένες εκτελέσεις και, σε ισοπαλία, η φυσική σειρά του προγράμματος.
 * Έτσι το Start από τη λίστα προγραμμάτων συνεχίζει τον κύκλο αντί να ανοίγει
 * τον editor ή να ξεκινά πάντα αυθαίρετα την πρώτη μέρα.
 */
export async function getNextProgramDay(programId: string): Promise<ProgramDay | null> {
  const [allDays, workouts] = await Promise.all([
    db.program_days.where('program_id').equals(programId).sortBy('position'),
    db.workouts.where('program_id').equals(programId).toArray(),
  ]);
  const days = allDays.filter((day) => day.deleted_at == null);
  if (days.length === 0) return null;

  const completedByDay = new Map<string, number>();
  for (const workout of workouts) {
    if (workout.deleted_at != null || workout.ended_at == null || !workout.program_day_id) continue;
    completedByDay.set(
      workout.program_day_id,
      (completedByDay.get(workout.program_day_id) ?? 0) + 1,
    );
  }

  return days.reduce((next, day) =>
    (completedByDay.get(day.id) ?? 0) < (completedByDay.get(next.id) ?? 0) ? day : next,
  );
}

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

  return rows.filter((r) => r.deleted_at == null).sort((a, b) => a.position - b.position);
}

/** Πόσες ασκήσεις έχει μια μέρα προγράμματος — για να ξέρεις τι ξεκινάς. */
export async function countProgramDayExercises(dayId: string): Promise<number> {
  const rows = await db.program_exercises.where('program_day_id').equals(dayId).toArray();
  return rows.filter((r) => r.deleted_at == null).length;
}
