import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { addSet, endWorkout, softDeleteWorkout, startWorkout } from '@/lib/db/queries';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import { getRecentExerciseIds } from './recentExercises';

beforeEach(async () => {
  setCurrentUserId('recent-exercises-profile');
  await db.exercises.clear();
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.workouts.clear();
  await db.sets.clear();
});

const log = async (workoutId: string, exerciseId: string) =>
  addSet({ workout_id: workoutId, exercise_id: exerciseId, weight_kg: 50, bodyweight_kg: null, reps: 5, hold_seconds: null });

describe('getRecentExerciseIds', () => {
  it('returns newest exercises first, unique, capped at the limit', async () => {
    const [a, b, c] = SEED_EXERCISES;
    const w1 = await startWorkout('strength');
    await log(w1.id, a!.id);
    await log(w1.id, b!.id);
    await endWorkout(w1.id);
    await new Promise((r) => setTimeout(r, 5));
    const w2 = await startWorkout('strength');
    await log(w2.id, c!.id);
    await log(w2.id, a!.id);
    await endWorkout(w2.id);

    const ids = await getRecentExerciseIds(6);
    expect(ids[0]).toBe(a!.id);
    expect(ids).toContain(b!.id);
    expect(ids).toContain(c!.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(await getRecentExerciseIds(2)).toHaveLength(2);
  });

  it('ignores exercises that only live in a deleted workout', async () => {
    const [a, b] = SEED_EXERCISES;
    const keep = await startWorkout('strength');
    await log(keep.id, a!.id);
    await endWorkout(keep.id);
    const gone = await startWorkout('strength');
    await log(gone.id, b!.id);
    await endWorkout(gone.id);
    await softDeleteWorkout(gone.id);

    const ids = await getRecentExerciseIds(6);
    expect(ids).toEqual([a!.id]);
  });

  it('is empty without history', async () => {
    expect(await getRecentExerciseIds()).toEqual([]);
  });
});
