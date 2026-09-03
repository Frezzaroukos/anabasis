import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import {
  createProgram,
  createProgramDay,
  listProgramDays,
  renameProgramDay,
  reorderProgramDays,
  deleteProgramDay,
  addProgramExercise,
  duplicateProgram,
  getProgramDayWithExercises,
  startWorkoutFromProgramDay,
  startAdHocWorkout,
  countProgramDaySessions,
  createExercise,
  endWorkout,
} from './queries';

/**
 * v12: πρόγραμμα → μέρες → ασκήσεις, link workout↔μέρα, auto-numbering, ad-hoc.
 * Το θεμέλιο της Calendar-centric δομής (docs/ARCHITECTURE-V4.md).
 */
beforeEach(async () => {
  setCurrentUserId('program-days-test');
  await db.programs.clear();
  await db.program_days.clear();
  await db.program_exercises.clear();
  await db.workouts.clear();
  await db.exercises.clear();
});

describe('program days', () => {
  it('φτιάχνει, μετονομάζει, αναδιατάσσει και σβήνει μέρες', async () => {
    const p = await createProgram('PPL');
    const push = await createProgramDay(p.id, 'Push');
    const pull = await createProgramDay(p.id, 'Pull');
    const legs = await createProgramDay(p.id, 'Legs');
    expect((await listProgramDays(p.id)).map((d) => d.name)).toEqual(['Push', 'Pull', 'Legs']);

    await renameProgramDay(push.id, 'Push A');
    await reorderProgramDays(p.id, [legs.id, pull.id, push.id]);
    expect((await listProgramDays(p.id)).map((d) => d.name)).toEqual(['Legs', 'Pull', 'Push A']);

    await deleteProgramDay(pull.id);
    expect((await listProgramDays(p.id)).map((d) => d.name)).toEqual(['Legs', 'Push A']);
  });

  it('deleteProgramDay σβήνει και τις ασκήσεις της μέρας (όχι ορφανές)', async () => {
    const p = await createProgram('Upper/Lower');
    const upper = await createProgramDay(p.id, 'Upper');
    const ex = await createExercise({ name: 'Bench Press' });
    await addProgramExercise(p.id, { exercise_id: ex.id, program_day_id: upper.id, target_sets: 4 });
    expect((await getProgramDayWithExercises(upper.id))!.exercises).toHaveLength(1);

    await deleteProgramDay(upper.id);
    expect(await db.program_exercises.where('program_day_id').equals(upper.id).count()).toBe(0);
  });

  it('startWorkoutFromProgramDay: linked workout + pre-filled plan + auto-numbering', async () => {
    const p = await createProgram('Split');
    const upper = await createProgramDay(p.id, 'Upper');
    const ex = await createExercise({ name: 'Overhead Press' });
    await addProgramExercise(p.id, { exercise_id: ex.id, program_day_id: upper.id, target_sets: 3 });

    const first = await startWorkoutFromProgramDay(upper.id);
    expect(first!.sessionNo).toBe(1);
    expect(first!.workout.program_day_id).toBe(upper.id);
    expect(first!.plan).toHaveLength(1);
    expect(first!.workout.workout_type).toBe('Upper #1');
    await endWorkout(first!.workout.id);

    // Δεύτερη φορά → «Upper #2».
    const second = await startWorkoutFromProgramDay(upper.id);
    expect(second!.sessionNo).toBe(2);
    expect(await countProgramDaySessions(upper.id)).toBe(1); // μία completed μέχρι στιγμής
  });

  it('startAdHocWorkout: καμία σύνδεση με πρόγραμμα (random/mini/for-fun)', async () => {
    const { workout, plan } = (await startAdHocWorkout('strength'))!;
    expect(workout.program_id).toBeNull();
    expect(workout.program_day_id).toBeNull();
    expect(plan).toHaveLength(0);
  });

  it('guard: δεν ξεκινά δεύτερη προπόνηση όσο μία είναι ήδη ενεργή (backdated hijack)', async () => {
    const p = await createProgram('Split');
    const upper = await createProgramDay(p.id, 'Upper');

    // Μία ήδη ανοιχτή ενεργή προπόνηση (π.χ. σημερινή, live) — και τα δύο
    // start* entry points πρέπει να αρνηθούν να ανοίξουν δεύτερη, αλλιώς ένα
    // ξεχασμένο backdated draft θα μπλοκάριζε τη σημερινή για πάντα.
    await startAdHocWorkout('strength');
    expect(await startWorkoutFromProgramDay(upper.id, '2026-01-01')).toBeNull();
    expect(await startAdHocWorkout('strength', '2026-01-01')).toBeNull();
  });
});

describe('duplicateProgram — κρατά τη δομή των ημερών', () => {
  it('αντιγράφει μέρες (νέα ids) και βάζει τις ασκήσεις στη σωστή μέρα', async () => {
    const p = await createProgram('Structured');
    const upper = await createProgramDay(p.id, 'Upper');
    const lower = await createProgramDay(p.id, 'Lower');
    await addProgramExercise(p.id, { exercise_id: 'ex-a', program_day_id: upper.id, target_sets: 3 });
    await addProgramExercise(p.id, { exercise_id: 'ex-b', program_day_id: lower.id, target_sets: 4 });

    const copy = await duplicateProgram(p.id);
    expect(copy).not.toBeNull();
    const copyDays = await listProgramDays(copy!.id);
    expect(copyDays.map((d) => d.name)).toEqual(['Upper', 'Lower']);
    // νέα ids (όχι ίδια με του original)
    expect(copyDays.some((d) => d.id === upper.id)).toBe(false);

    const copyUpper = await getProgramDayWithExercises(copyDays[0]!.id);
    const copyLower = await getProgramDayWithExercises(copyDays[1]!.id);
    expect(copyUpper!.exercises.map((e) => e.exercise_id)).toEqual(['ex-a']);
    expect(copyLower!.exercises.map((e) => e.exercise_id)).toEqual(['ex-b']);
  });
})
