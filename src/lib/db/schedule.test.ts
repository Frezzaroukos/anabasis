import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './index';
import { setCurrentUserId } from './session';
import {
  addProgramExercise,
  createProgram,
  createProgramDay,
  startWorkoutFromProgramDay,
} from './queries';
import { countProgramDayExercises, getWorkoutPlan } from './schedule';

beforeEach(async () => {
  setCurrentUserId('schedule-test');
  await db.programs.clear();
  await db.program_days.clear();
  await db.program_exercises.clear();
  await db.workouts.clear();
});

/**
 * Η δομή του προγράμματος σταματούσε στη βάση: το startWorkoutFromProgramDay
 * επέστρεφε `plan` αλλά κανένας caller δεν το κρατούσε και η οθόνη καταγραφής
 * δεν ρωτούσε ποτέ για πρόγραμμα. Αυτός ο helper είναι η γέφυρα.
 */
describe('getWorkoutPlan', () => {
  it('δεμένη σε ΜΕΡΑ → μόνο οι ασκήσεις εκείνης της μέρας, με τη σειρά τους', async () => {
    const program = await createProgram('Split');
    const upper = await createProgramDay(program.id, 'Upper');
    const legs = await createProgramDay(program.id, 'Legs');

    await addProgramExercise(program.id, { exercise_id: 'ex-pull', program_day_id: upper.id });
    await addProgramExercise(program.id, { exercise_id: 'ex-squat', program_day_id: legs.id });
    await addProgramExercise(program.id, { exercise_id: 'ex-dip', program_day_id: upper.id });

    const plan = await getWorkoutPlan({ program_id: program.id, program_day_id: upper.id });
    expect(plan.map((p) => p.exercise_id)).toEqual(['ex-pull', 'ex-dip']);
  });

  it('δεμένη σε ΠΡΟΓΡΑΜΜΑ χωρίς μέρα → ΔΕΝ ισοπεδώνει τις μέρες του', async () => {
    const program = await createProgram('Split');
    const upper = await createProgramDay(program.id, 'Upper');
    await addProgramExercise(program.id, { exercise_id: 'ex-flat', program_day_id: null });
    await addProgramExercise(program.id, { exercise_id: 'ex-pull', program_day_id: upper.id });

    const plan = await getWorkoutPlan({ program_id: program.id, program_day_id: null });
    expect(plan.map((p) => p.exercise_id)).toEqual(['ex-flat']);
  });

  it('χωρίς πρόγραμμα (ad-hoc) → κενό πλάνο, καμία έκπληξη', async () => {
    expect(await getWorkoutPlan({ program_id: null, program_day_id: null })).toEqual([]);
    expect(await getWorkoutPlan(null)).toEqual([]);
  });

  it('κρατά τους στόχους της γραμμής — αυτοί είναι το «πόσα»', async () => {
    const program = await createProgram('Split');
    const upper = await createProgramDay(program.id, 'Upper');
    await addProgramExercise(program.id, {
      exercise_id: 'ex-pull',
      program_day_id: upper.id,
      target_sets: 3,
      target_reps: 8,
      target_weight_kg: 20,
    });

    const [row] = await getWorkoutPlan({ program_id: program.id, program_day_id: upper.id });
    expect(row!.target_sets).toBe(3);
    expect(row!.target_reps).toBe(8);
    expect(row!.target_weight_kg).toBe(20);
  });

  it('η προπόνηση που φτιάχνει το Calendar βρίσκει το πλάνο της μέρας της', async () => {
    const program = await createProgram('Split');
    const upper = await createProgramDay(program.id, 'Upper');
    await addProgramExercise(program.id, { exercise_id: 'ex-pull', program_day_id: upper.id });

    const started = await startWorkoutFromProgramDay(upper.id, '2026-08-01');
    expect(started).not.toBeNull();
    const plan = await getWorkoutPlan(started!.workout);
    expect(plan.map((p) => p.exercise_id)).toEqual(['ex-pull']);
  });
});

describe('countProgramDayExercises', () => {
  it('μετρά μόνο τις ασκήσεις της συγκεκριμένης μέρας', async () => {
    const program = await createProgram('Split');
    const upper = await createProgramDay(program.id, 'Upper');
    const legs = await createProgramDay(program.id, 'Legs');
    await addProgramExercise(program.id, { exercise_id: 'a', program_day_id: upper.id });
    await addProgramExercise(program.id, { exercise_id: 'b', program_day_id: upper.id });
    await addProgramExercise(program.id, { exercise_id: 'c', program_day_id: legs.id });

    expect(await countProgramDayExercises(upper.id)).toBe(2);
    expect(await countProgramDayExercises(legs.id)).toBe(1);
  });
});
