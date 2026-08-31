import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { db } from './index';
import { SEED_EXERCISES } from './seeds';
import { addSet, endWorkout, listWorkoutSummaries, startWorkout } from './queries';
import { getCurrentUserId, setCurrentUserId } from './session';

/**
 * Το ιστορικό χρειάζεται «με μια ματιά» σετ/όγκο/κυρίαρχη άσκηση. Κλειδώνουμε
 * ότι το summary μετράει σωστά και αγνοεί warm-ups & μη-ολοκληρωμένες.
 */
describe('listWorkoutSummaries', () => {
  let original: string;
  const squat = SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;
  const bench = SEED_EXERCISES.find((e) => e.name === 'Bench Press')!;

  beforeAll(async () => {
    original = getCurrentUserId();
    setCurrentUserId('workout-summaries-profile');
    await db.exercises.bulkPut(SEED_EXERCISES);
  });
  afterAll(() => setCurrentUserId(original));

  it('μετράει σετ+όγκο, βρίσκει κυρίαρχη άσκηση, αγνοεί warm-up', async () => {
    const w = await startWorkout('strength');
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await addSet({ workout_id: w.id, exercise_id: bench.id, weight_kg: 60, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await addSet({
      workout_id: w.id, exercise_id: bench.id, weight_kg: 40, bodyweight_kg: null,
      reps: 10, hold_seconds: null, set_type: 'warmup', is_warmup: true,
    });
    await endWorkout(w.id);

    const summaries = await listWorkoutSummaries();
    const s = summaries.find((x) => x.workout.id === w.id)!;
    expect(s.setCount).toBe(3); // το warm-up δεν μετράει
    expect(s.volume).toBe(100 * 5 + 100 * 5 + 60 * 5); // 1300
    expect(s.topExercise).toBe('Back Squat'); // 2 σετ vs 1
  });

  it('δεν περιλαμβάνει προπόνηση σε εξέλιξη (χωρίς ended_at)', async () => {
    const live = await startWorkout('strength');
    await addSet({ workout_id: live.id, exercise_id: squat.id, weight_kg: 80, bodyweight_kg: null, reps: 5, hold_seconds: null });
    const summaries = await listWorkoutSummaries();
    expect(summaries.some((x) => x.workout.id === live.id)).toBe(false);
  });
});
