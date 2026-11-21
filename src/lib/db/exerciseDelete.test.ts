import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import {
  addProgramExercise,
  addSet,
  countExerciseUsage,
  createExercise,
  createProgram,
  deleteExercise,
  listAllExercises,
  listExercises,
  startWorkout,
} from './queries';
import { createGoal } from './goals';
import { SEED_EXERCISES } from './seeds';

/**
 * Διαγραφή άσκησης: επιτρεπτή μόνο για ΔΙΚΕΣ ΣΟΥ, άδειες ασκήσεις. Ό,τι έχει
 * ιστορικό (σετ/PR/πρόγραμμα/στόχο) μπλοκάρεται αντί να σπάσει — ο χρήστης
 * βλέπει γιατί. Οι builtin ποτέ δεν διαγράφονται.
 */

beforeEach(async () => {
  setCurrentUserId('exercise-delete-profile');
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.workouts.clear();
  await db.sets.clear();
  await db.program_exercises.clear();
  await db.programs.clear();
  await db.goals.clear();
});

describe('deleteExercise', () => {
  it('διαγράφει (soft) δική σου άσκηση χωρίς ιστορικό', async () => {
    const ex = await createExercise({ name: 'Delete Me Empty' });
    const result = await deleteExercise(ex.id);

    expect(result.deleted).toBe(true);
    expect((await db.exercises.get(ex.id))?.deleted_at).not.toBeNull();
    expect((await listExercises()).some((e) => e.id === ex.id)).toBe(false);
    expect((await listAllExercises()).some((e) => e.id === ex.id)).toBe(false);
  });

  it('μπλοκάρει builtin άσκηση', async () => {
    const builtin = SEED_EXERCISES[0]!;
    const result = await deleteExercise(builtin.id);

    expect(result.deleted).toBe(false);
    if (!result.deleted) expect(result.reason).toBe('builtin');
    expect((await db.exercises.get(builtin.id))?.deleted_at ?? null).toBeNull();
  });

  it('μπλοκάρει άσκηση με σετ στο ιστορικό και εξηγεί γιατί', async () => {
    const ex = await createExercise({ name: 'Delete Me With Sets' });
    const w = await startWorkout('strength');
    await addSet({ workout_id: w.id, exercise_id: ex.id, weight_kg: 20, bodyweight_kg: null, reps: 5, hold_seconds: null });

    const result = await deleteExercise(ex.id);
    expect(result.deleted).toBe(false);
    if (!result.deleted) {
      expect(result.reason).toBe('in_use');
      expect(result.usage.sets).toBe(1);
    }
    expect((await db.exercises.get(ex.id))?.deleted_at ?? null).toBeNull();
  });

  it('μπλοκάρει άσκηση που χρησιμοποιείται σε πρόγραμμα', async () => {
    const ex = await createExercise({ name: 'Delete Me In Program' });
    const p = await createProgram('Prog', 'strength');
    await addProgramExercise(p.id, { exercise_id: ex.id, target_sets: 3 });

    const result = await deleteExercise(ex.id);
    expect(result.deleted).toBe(false);
    if (!result.deleted) expect(result.usage.programs).toBe(1);
  });

  it('μπλοκάρει άσκηση που χρησιμοποιείται σε στόχο', async () => {
    const ex = await createExercise({ name: 'Delete Me In Goal' });
    await createGoal({ metric: 'sessions', target: 2, period: 'week', exercise_id: ex.id });

    const result = await deleteExercise(ex.id);
    expect(result.deleted).toBe(false);
    if (!result.deleted) expect(result.usage.goals).toBe(1);
  });

  it('countExerciseUsage αθροίζει σετ/PR/πρόγραμμα/στόχο', async () => {
    const ex = await createExercise({ name: 'Usage Counter' });
    const w = await startWorkout('strength');
    await addSet({ workout_id: w.id, exercise_id: ex.id, weight_kg: 10, bodyweight_kg: null, reps: 5, hold_seconds: null });
    const p = await createProgram('Prog2', 'strength');
    await addProgramExercise(p.id, { exercise_id: ex.id, target_sets: 3 });
    await createGoal({ metric: 'sessions', target: 2, period: 'week', exercise_id: ex.id });

    const usage = await countExerciseUsage(ex.id);
    expect(usage.sets).toBeGreaterThanOrEqual(1);
    expect(usage.programs).toBe(1);
    expect(usage.goals).toBe(1);
    expect(usage.total).toBe(usage.sets + usage.prs + usage.programs + usage.goals);
  });
});
