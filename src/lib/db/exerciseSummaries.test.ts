import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from './index';
import {
  addSet,
  createExercise,
  endWorkout,
  getExerciseSummaries,
  softDeleteSet,
  startWorkout,
} from './queries';
import { getCurrentUserId, setCurrentUserId } from './session';

/**
 * Η λίστα προόδου διαβάζει μία φορά όλα τα σετ. Ένα tombstone δεν πρέπει να
 * μετράει ως «τελευταία προπόνηση» — αλλιώς μια σβησμένη καταγραφή μένει στο badge.
 */
describe('getExerciseSummaries', () => {
  let original: string;

  beforeAll(() => {
    original = getCurrentUserId();
    setCurrentUserId('exercise-summaries-profile');
  });

  afterAll(() => setCurrentUserId(original));

  it('μετράει ζωντανό σετ και αγνοεί το soft-deleted', async () => {
    const exercise = await createExercise({ name: 'Summary only press' });
    const workout = await startWorkout('strength');
    const set = await addSet({
      workout_id: workout.id,
      exercise_id: exercise.id,
      weight_kg: 20,
      bodyweight_kg: null,
      reps: 8,
      hold_seconds: null,
    });
    await endWorkout(workout.id);

    const live = await getExerciseSummaries();
    expect(live.get(exercise.id)?.setCount).toBe(1);
    expect(live.get(exercise.id)?.lastTrainedAt).toBeTruthy();

    await softDeleteSet(set.id);
    const after = await getExerciseSummaries();
    expect(after.get(exercise.id)?.setCount ?? 0).toBe(0);

    const stored = await db.sets.get(set.id);
    expect(stored?.deleted_at).toBeTruthy();
  });
});
