import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import { SEED_EXERCISES } from './seeds';
import { addSet, endWorkout, getExerciseSummaries, getWorkoutDetail, localDay, saveBodyMetric, startWorkout } from './queries';
import {
  clearBodyMetric,
  duplicateSet,
  inferExerciseDefaults,
  listRecentBodyMetrics,
  savePastedWorkout,
} from './workoutHelpers';

beforeEach(async () => {
  setCurrentUserId('helpers-test-profile');
  await db.exercises.clear();
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.workouts.clear();
  await db.sets.clear();
  await db.personal_records.clear();
  await db.body_metrics.clear();
});

describe('getExerciseSummaries', () => {
  it('μετράει μόνο σετ του τρέχοντος προφίλ', async () => {
    const squat = SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;
    setCurrentUserId('summary-a');
    const mineWorkout = await startWorkout('strength');
    const mine = await addSet({
      workout_id: mineWorkout.id,
      exercise_id: squat.id,
      weight_kg: 100,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
    });
    await endWorkout(mineWorkout.id);

    setCurrentUserId('summary-b');
    const otherWorkout = await startWorkout('strength');
    const other = await addSet({
      workout_id: otherWorkout.id,
      exercise_id: squat.id,
      weight_kg: 200,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
    });
    await db.sets.update(other.id, { created_at: '2099-01-01T00:00:00.000Z' });
    await endWorkout(otherWorkout.id);

    setCurrentUserId('summary-a');
    const summary = await getExerciseSummaries();
    expect(summary.get(squat.id)?.lastTrainedAt).toBe(mine.created_at);
  });
});

describe('inferExerciseDefaults', () => {
  it('marks calisthenics bodyweight exercises as bodyweight + weighted', () => {
    const mu = inferExerciseDefaults('Muscle Up');
    expect(mu.is_bodyweight).toBe(true);
    expect(mu.is_weighted).toBe(true);
    expect(mu.category).toBe('pull');
  });

  it('marks isometric holds as skill + sec default unit', () => {
    const hold = inferExerciseDefaults('Planche Lean Hold');
    expect(hold.is_bodyweight).toBe(true);
    expect(hold.default_unit).toBe('sec');
    expect(hold.movement_type).toBe('skill');
  });
});

describe('savePastedWorkout & duplicateSet', () => {
  it('creates a completed backdated workout with drop-set group_ids and auto-created exercises', async () => {
    const bench = SEED_EXERCISES.find((e) => e.name === 'Bench Press')!;
    const res = await savePastedWorkout({
      date: '2026-11-18',
      workoutType: 'Upper',
      lines: [
        {
          exerciseId: bench.id,
          newExerciseName: bench.name,
          sets: [
            { weightKg: 80, reps: 5, dropGroup: 1 },
            { weightKg: 60, reps: 8, setType: 'dropset', dropGroup: 1 },
          ],
        },
        {
          exerciseId: null,
          newExerciseName: 'SAT Machine Rows',
          sets: [
            { weightKg: 18, reps: null, setType: 'amrap', notes: 'max' },
            { weightKg: 18, reps: null, setType: 'amrap', notes: 'max' },
          ],
        },
      ],
    });

    expect(res.setsAdded).toBe(4);
    expect(res.exercisesCreated).toBe(1);

    const detail = await getWorkoutDetail(res.workoutId);
    expect(detail).not.toBeNull();
    expect(localDay(new Date(detail!.workout.started_at))).toBe('2026-11-18');
    expect(detail!.workout.ended_at).not.toBeNull();
    expect(detail!.workout.duration_seconds).toBeNull(); // no invented duration
    expect(detail!.exercises).toHaveLength(2);

    const benchSets = detail!.exercises[0]!.sets;
    expect(benchSets[0]!.group_id).toBeTruthy();
    expect(benchSets[0]!.group_id).toBe(benchSets[1]!.group_id);
    expect(benchSets[1]!.set_type).toBe('dropset');

    const duplicated = await duplicateSet(benchSets[0]!);
    expect(duplicated.weight_kg).toBe(80);
    expect(duplicated.reps).toBe(5);
    expect(duplicated.set_number).toBe(3);
  });

  it('rejects empty lines without creating a ghost workout', async () => {
    await expect(
      savePastedWorkout({
        date: '2026-11-18',
        lines: [],
      }),
    ).rejects.toThrow();
    expect(await db.workouts.count()).toBe(0);
  });
});

describe('body metrics helpers', () => {
  it('lists recent non-empty entries newest-first and clears an entry cleanly', async () => {
    await saveBodyMetric('2026-11-16', { weight_kg: 76.2 });
    await saveBodyMetric('2026-11-18', { weight_kg: 75.8, steps: 9200 });

    const before = await listRecentBodyMetrics();
    expect(before.map((m) => m.date)).toEqual(['2026-11-18', '2026-11-16']);

    await clearBodyMetric('2026-11-16');
    const after = await listRecentBodyMetrics();
    expect(after.map((m) => m.date)).toEqual(['2026-11-18']);
  });
});
