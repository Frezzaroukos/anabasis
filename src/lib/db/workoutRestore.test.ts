import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import {
  addSet,
  endWorkout,
  getWorkoutDetail,
  removeExerciseFromWorkout,
  softDeleteSet,
  startWorkout,
} from './queries';
import { restoreExerciseInWorkout, restoreSet } from './workoutRestore';
import { SEED_EXERCISES } from './seeds';

/**
 * Undo για διαγραφή σετ/άσκησης. Το σβήσιμο είναι soft (tombstone)· η
 * επαναφορά καθαρίζει το tombstone ΚΑΙ ξαναχτίζει τα PR — γιατί ένα
 * επαναφερμένο σετ μπορεί να ξανασπάσει ρεκόρ που είχε πέσει.
 */
const squat = SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;
const bench = SEED_EXERCISES.find((e) => e.name === 'Bench Press')!;

beforeEach(async () => {
  setCurrentUserId('workout-restore-profile');
  await db.exercises.clear();
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.workouts.clear();
  await db.sets.clear();
  await db.personal_records.clear();
});

async function liveSets(workoutId: string) {
  return (await db.sets.where('workout_id').equals(workoutId).toArray()).filter(
    (s) => s.deleted_at == null,
  );
}

async function liveMaxWeight(exerciseId: string): Promise<number | null> {
  const rows = (await db.personal_records.toArray()).filter(
    (r) => r.exercise_id === exerciseId && r.type === 'max_weight' && r.deleted_at == null,
  );
  return rows.length ? Math.max(...rows.map((r) => r.value)) : null;
}

describe('restoreSet', () => {
  it('επαναφέρει soft-deleted σετ και ξανασπάει το ρεκόρ που είχε πέσει', async () => {
    const w = await startWorkout('strength');
    const weak = await addSet({
      workout_id: w.id, exercise_id: squat.id, weight_kg: 90, bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    const heavy = await addSet({
      workout_id: w.id, exercise_id: squat.id, weight_kg: 120, bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    await endWorkout(w.id);
    expect(await liveMaxWeight(squat.id)).toBe(120);
    expect((await db.sets.get(weak.id))!.deleted_at).toBeNull();

    await softDeleteSet(heavy.id);
    expect(await liveMaxWeight(squat.id)).toBe(90);

    await restoreSet(heavy.id);

    expect((await db.sets.get(heavy.id))!.deleted_at).toBeNull();
    expect(await liveMaxWeight(squat.id)).toBe(120);
  });

  it('no-op όταν το σετ δεν είναι διαγραμμένο', async () => {
    const w = await startWorkout('strength');
    const s = await addSet({
      workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    await endWorkout(w.id);
    const before = (await db.sets.get(s.id))!;
    await restoreSet(s.id);
    expect((await db.sets.get(s.id))!.updated_at).toBe(before.updated_at);
  });
});

describe('restoreExerciseInWorkout', () => {
  it('επαναφέρει όλα τα σετ της άσκησης και επιστρέφει το πλήθος', async () => {
    const w = await startWorkout('strength');
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 110, bodyweight_kg: null, reps: 3, hold_seconds: null });
    await addSet({ workout_id: w.id, exercise_id: bench.id, weight_kg: 80, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w.id);

    await removeExerciseFromWorkout(w.id, squat.id);
    expect((await getWorkoutDetail(w.id))!.exercises.map((e) => e.exerciseId)).toEqual([bench.id]);

    const restored = await restoreExerciseInWorkout(w.id, squat.id);

    expect(restored).toBe(2);
    const detail = await getWorkoutDetail(w.id);
    expect(detail!.exercises.some((e) => e.exerciseId === squat.id)).toBe(true);
    expect(await liveMaxWeight(squat.id)).toBe(110);
  });

  it('δεν αγγίζει σετ της ίδιας άσκησης σε ΑΛΛΗ προπόνηση', async () => {
    const w1 = await startWorkout('strength');
    await addSet({ workout_id: w1.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w1.id);

    const w2 = await startWorkout('strength');
    await addSet({ workout_id: w2.id, exercise_id: squat.id, weight_kg: 120, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w2.id);

    await removeExerciseFromWorkout(w2.id, squat.id);
    // Τα σετ του w1 παραμένουν ζωντανά.
    expect((await liveSets(w1.id)).length).toBe(1);

    await restoreExerciseInWorkout(w2.id, squat.id);
    expect((await liveSets(w2.id)).length).toBe(1);
    expect((await liveSets(w1.id)).length).toBe(1);
  });

  it('επιστρέφει 0 όταν δεν υπάρχει τίποτα να επαναφερθεί', async () => {
    const w = await startWorkout('strength');
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w.id);
    expect(await restoreExerciseInWorkout(w.id, squat.id)).toBe(0);
  });
});
