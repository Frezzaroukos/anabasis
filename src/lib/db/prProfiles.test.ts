import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './index';
import { SEED_EXERCISES } from './seeds';
import { setCurrentUserId } from './session';
import { addSet, endWorkout, recomputePRsForExercise, startWorkout } from './queries';
import type { PersonalRecord } from './types';

/**
 * Οι seed ασκήσεις είναι ΚΟΙΝΕΣ σε όλα τα προφίλ (user_id = null), άρα το
 * db.sets.where('exercise_id') φέρνει και σετ άλλων προφίλ. Το recompute δεν
 * πρέπει να τα μετρά: τα ρεκόρ ενός προφίλ βγαίνουν μόνο από ΔΙΚΕΣ του προπονήσεις.
 */
const pull = SEED_EXERCISES.find((e) => e.name === 'Pull-ups')!;

const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function session(daysAgo: number, reps: number, weight: number | null = null) {
  const w = await startWorkout('strength', day(daysAgo));
  await addSet({ workout_id: w.id, exercise_id: pull.id, weight_kg: weight, bodyweight_kg: null, reps, hold_seconds: null });
  await endWorkout(w.id);
}

const mine = async (uid: string): Promise<PersonalRecord[]> =>
  (await db.personal_records.where('user_id').equals(uid).toArray()).filter(
    (r) => r.deleted_at == null && r.exercise_id === pull.id,
  );

beforeEach(async () => {
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.workouts.clear();
  await db.sets.clear();
  await db.personal_records.clear();
});

describe('PR recompute ανά προφίλ', () => {
  it('σετ άλλου προφίλ στην ίδια (κοινή) άσκηση δεν μπαίνουν στα ρεκόρ μου', async () => {
    setCurrentUserId('profile-a');
    await session(9, 40); // ο Α κάνει 40 έλξεις
    await session(8, 6, 10);

    setCurrentUserId('profile-b');
    await session(5, 10);
    await session(2, 12);
    const live = await mine('profile-b');
    await recomputePRsForExercise(pull.id);
    const after = await mine('profile-b');

    const maxReps = after.filter((r) => r.type === 'max_reps').map((r) => r.value).sort((a, b) => a - b);
    expect(maxReps).toEqual([10, 12]);
    expect(after.some((r) => r.type === 'max_weight')).toBe(false); // το +10 kg είναι του Α
    // live (addSet) και recompute συμφωνούν
    const sig = (rows: PersonalRecord[]) => rows.map((r) => `${r.type}|${r.set_id}|${r.value}`).sort();
    expect(sig(after)).toEqual(sig(live));
  });
});
