import { describe, expect, it, beforeAll } from 'vitest';
import { db } from './index';
import { bootstrapDB } from './bootstrap';
import { addSet, createExercise, startWorkout, listExercises } from './queries';
import { mergeExercises } from './exerciseMerge';

beforeAll(async () => {
  await bootstrapDB();
});

async function logSet(workoutId: string, exerciseId: string, weight: number, reps: number) {
  return addSet({
    workout_id: workoutId,
    exercise_id: exerciseId,
    weight_kg: weight,
    bodyweight_kg: null,
    reps,
    hold_seconds: null,
  });
}

describe('mergeExercises', () => {
  it('ξαναγονεϊκοποιεί sets + PRs + αρχειοθετεί την πηγή', async () => {
    const source = await createExercise({ name: 'Merge Pull Ups BW' });
    const target = await createExercise({ name: 'Merge Pull Ups Weighted' });
    const w = await startWorkout('strength');
    // 2 σετ στην πηγή (το 2ο σπάει PR max_reps), 1 στον στόχο.
    await logSet(w.id, source.id, 0, 8);
    await logSet(w.id, source.id, 0, 12);
    await logSet(w.id, target.id, 20, 5);

    const srcSetsBefore = await db.sets.where('exercise_id').equals(source.id).count();
    expect(srcSetsBefore).toBe(2);

    await mergeExercises(source.id, target.id);

    // Πηγή άδεια + αρχειοθετημένη.
    expect(await db.sets.where('exercise_id').equals(source.id).count()).toBe(0);
    expect((await db.exercises.get(source.id))?.is_archived).toBe(true);

    // Στόχος έχει και τα 3 σετ.
    expect(await db.sets.where('exercise_id').equals(target.id).count()).toBe(3);

    // Κανένα PR δεν μένει «ορφανό» στην πηγή· όλα re-parented.
    expect(await db.personal_records.where('exercise_id').equals(source.id).count()).toBe(0);
    const targetPRs = await db.personal_records.where('exercise_id').equals(target.id).count();
    expect(targetPRs).toBeGreaterThan(0);
  });

  it('no-op για ίδια/κενά ids', async () => {
    const e = await createExercise({ name: 'Merge Noop' });
    await mergeExercises(e.id, e.id);
    await mergeExercises('', e.id);
    expect((await db.exercises.get(e.id))?.is_archived).toBeFalsy();
  });

  it('η ενωμένη πηγή δεν εμφανίζεται στη λίστα ενεργών ασκήσεων', async () => {
    const source = await createExercise({ name: 'Merge Dupe A' });
    const target = await createExercise({ name: 'Merge Dupe B' });
    await mergeExercises(source.id, target.id);
    const active = await listExercises();
    expect(active.some((e) => e.id === source.id)).toBe(false);
    expect(active.some((e) => e.id === target.id)).toBe(true);
  });
});
