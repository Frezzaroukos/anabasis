import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import {
  addSet,
  adjustExerciseSetWeights,
  duplicateWorkoutToDate,
  endWorkout,
  getWorkoutDetail,
  localDay,
  moveSetToExercise,
  setWorkoutDate,
  softDeleteSet,
  startWorkout,
} from './queries';
import { createScheduledSession, listScheduledSessions } from './scheduledSessions';
import { restoreSet } from './workoutRestore';
import { SEED_EXERCISES } from './seeds';

/**
 * Λεπτομέρειες επεξεργασίας ιστορικού (lane A-detail): renumber μετά από
 * move/delete, batch βάρος, αντιγραφή σε άλλη μέρα, scheduled link sync.
 */
const squat = SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;
const bench = SEED_EXERCISES.find((e) => e.name === 'Bench Press')!;
const UID = 'a-detail-profile';

beforeEach(async () => {
  setCurrentUserId(UID);
  await db.exercises.clear();
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.workouts.clear();
  await db.sets.clear();
  await db.personal_records.clear();
  await db.scheduled_sessions.clear();
});

async function setNumbers(workoutId: string, exerciseId: string): Promise<number[]> {
  return (
    await db.sets
      .where('workout_id')
      .equals(workoutId)
      .and((s) => s.exercise_id === exerciseId && s.deleted_at == null)
      .toArray()
  )
    .sort((a, b) => a.set_number - b.set_number)
    .map((s) => s.set_number);
}

describe('Bug L1 — moveSetToExercise δεν αφήνει κενά', () => {
  it('ξαναριθμεί την αρχική άσκηση μετά τη μετακίνηση (πυκνή 1..N)', async () => {
    const w = await startWorkout('strength');
    // squat: 3 σετ (#1,#2,#3). Μετακίναμε το #2 στο bench.
    const a = await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    const b = await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 105, bodyweight_kg: null, reps: 5, hold_seconds: null });
    const c = await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 110, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w.id);

    await moveSetToExercise(b.id, bench.id);

    // Η αρχική (squat) πρέπει να είναι #1,#2 — όχι #1,#3.
    expect(await setNumbers(w.id, squat.id)).toEqual([1, 2]);
    // Το bench πήρε το σετ ως #1 (πρώτο του).
    expect(await setNumbers(w.id, bench.id)).toEqual([1]);
    // Τα ίδια σετ, απλώς ξαναριθμημένα.
    expect((await db.sets.get(a.id))!.set_number).toBe(1);
    expect((await db.sets.get(c.id))!.set_number).toBe(2);
  });

  it('μετακίνηση σε ΜΗ-κενή άσκηση: και οι δύο πυκνές', async () => {
    const w = await startWorkout('strength');
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    const moving = await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 105, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await addSet({ workout_id: w.id, exercise_id: bench.id, weight_kg: 60, bodyweight_kg: null, reps: 8, hold_seconds: null });
    await endWorkout(w.id);

    await moveSetToExercise(moving.id, bench.id);

    expect(await setNumbers(w.id, squat.id)).toEqual([1]);
    expect(await setNumbers(w.id, bench.id)).toEqual([1, 2]);
  });
});

describe('softDeleteSet — κλείνει το κενό', () => {
  it('μετά τη διαγραφή του #2, τα υπόλοιπα ξαναριθμούνται', async () => {
    const w = await startWorkout('strength');
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    const mid = await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 105, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 110, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w.id);

    await softDeleteSet(mid.id);

    expect(await setNumbers(w.id, squat.id)).toEqual([1, 2]);
  });
});

describe('restoreSet — undo χωρίς διπλό set_number', () => {
  it('delete #2 → undo → πυκνή σειρά #1,#2,#3 με το σετ πίσω στη θέση 2', async () => {
    const w = await startWorkout('strength');
    const s1 = await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    const s2 = await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 105, bodyweight_kg: null, reps: 5, hold_seconds: null });
    const s3 = await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 110, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w.id);

    await softDeleteSet(s2.id);
    // Μετά τη διαγραφή: #1 (s1), #2 (s3).
    expect(await setNumbers(w.id, squat.id)).toEqual([1, 2]);
    expect((await db.sets.get(s3.id))!.set_number).toBe(2);

    await restoreSet(s2.id);

    // Πυκνή 1..3 χωρίς διπλό, και το s2 ξανά στη θέση #2.
    expect(await setNumbers(w.id, squat.id)).toEqual([1, 2, 3]);
    expect((await db.sets.get(s2.id))!.set_number).toBe(2);
    expect((await db.sets.get(s3.id))!.set_number).toBe(3);
    expect((await db.sets.get(s1.id))!.set_number).toBe(1);
  });

  it('undo του ΠΡΩΤΟΥ σετ σπρώχνει τα υπόλοιπα κάτω', async () => {
    const w = await startWorkout('strength');
    const s1 = await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 105, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w.id);

    await softDeleteSet(s1.id);
    expect(await setNumbers(w.id, squat.id)).toEqual([1]);

    await restoreSet(s1.id);
    expect(await setNumbers(w.id, squat.id)).toEqual([1, 2]);
    expect((await db.sets.get(s1.id))!.set_number).toBe(1);
  });
});

describe('adjustExerciseSetWeights — batch αλλαγή βάρους', () => {
  it('προσθέτει delta σε όλα τα weighted working σετ και ξαναϋπολογίζει PR', async () => {
    const w = await startWorkout('strength');
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 110, bodyweight_kg: null, reps: 3, hold_seconds: null });
    // warm-up δεν πρέπει να αλλάξει
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 60, bodyweight_kg: null, reps: 5, hold_seconds: null, is_warmup: true, set_type: 'warmup' });
    await endWorkout(w.id);

    const res = await adjustExerciseSetWeights(w.id, squat.id, { deltaKg: -10 });
    expect(res.updated).toBe(2);
    const weights = (
      await db.sets.where('workout_id').equals(w.id).toArray()
    ).filter((s) => !s.is_warmup).map((s) => s.weight_kg).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(weights).toEqual([90, 100]);
    // Το warm-up έμεινε 60.
    expect((await db.sets.where('workout_id').equals(w.id).toArray()).some((s) => s.is_warmup && s.weight_kg === 60)).toBe(true);

    // PR recompute: max_weight 110 → 100.
    const livePr = (await db.personal_records.toArray()).filter(
      (r) => r.exercise_id === squat.id && r.type === 'max_weight' && r.deleted_at == null,
    );
    expect(Math.max(...livePr.map((r) => r.value))).toBe(100);
  });

  it('absolute θέτει σταθερό βάρος σε όλα', async () => {
    const w = await startWorkout('strength');
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 120, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w.id);

    const res = await adjustExerciseSetWeights(w.id, squat.id, { absoluteKg: 80 });
    expect(res.updated).toBe(2);
    const weights = (await db.sets.where('workout_id').equals(w.id).toArray()).map((s) => s.weight_kg);
    expect(weights.every((x) => x === 80)).toBe(true);
  });

  it('δεν αγγίζει σετ χωρίς βάρος (bodyweight) — updated 0', async () => {
    const w = await startWorkout('strength');
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: null, bodyweight_kg: 80, reps: 10, hold_seconds: null });
    await endWorkout(w.id);
    const res = await adjustExerciseSetWeights(w.id, squat.id, { deltaKg: 5 });
    expect(res.updated).toBe(0);
  });
});

describe('duplicateWorkoutToDate — αντιγραφή σε άλλη μέρα', () => {
  it('αντιγράφει προπόνηση με όλα τα σετ σε νέα ημερομηνία', async () => {
    const w = await startWorkout('strength', '2026-11-10', null, null, 'Upper');
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await addSet({ workout_id: w.id, exercise_id: bench.id, weight_kg: 80, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w.id);

    const newId = await duplicateWorkoutToDate(w.id, '2026-11-05');
    expect(newId).toBeTruthy();
    expect(newId).not.toBe(w.id);

    const copy = await db.workouts.get(newId!);
    expect(copy!.workout_type).toBe('Upper');
    expect(localDay(new Date(copy!.started_at))).toBe('2026-11-05');
    expect(copy!.ended_at).not.toBeNull();

    const copySets = await db.sets.where('workout_id').equals(newId!).toArray();
    expect(copySets).toHaveLength(2);
    // Νέα ids, ίδιο περιεχόμενο.
    expect(copySets.every((s) => s.deleted_at == null)).toBe(true);
    expect(copySets.find((s) => s.exercise_id === squat.id)!.weight_kg).toBe(100);

    // Η αρχική μένει ανέπαφη.
    expect(await db.sets.where('workout_id').equals(w.id).count()).toBe(2);
    // Το αντίγραφο εμφανίζεται στο detail.
    const detail = await getWorkoutDetail(newId!);
    expect(detail!.totalSets).toBe(2);
  });

  it('επιστρέφει null για ανύπαρκτη ή διαγραμμένη πηγή', async () => {
    expect(await duplicateWorkoutToDate('nope', '2026-11-01')).toBeNull();
  });

  it('διατηρεί τη ΣΕΙΡΑ ΑΣΚΗΣΕΩΝ του αντιγράφου (μέσω created_at)', async () => {
    // Πηγή: τρεις ασκήσεις σε σειρά C (Incline), A (Bench), B (Back Squat).
    const incline = SEED_EXERCISES.find((e) => e.name === 'Incline Bench Press')!;
    const w = await startWorkout('strength', '2026-11-10', null, null, 'Mixed');
    const si = await addSet({ workout_id: w.id, exercise_id: incline.id, weight_kg: 60, bodyweight_kg: null, reps: 5, hold_seconds: null });
    const sb = await addSet({ workout_id: w.id, exercise_id: bench.id, weight_kg: 80, bodyweight_kg: null, reps: 5, hold_seconds: null });
    const sq = await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w.id);
    // Σταθερή, ρητή σειρά created_at (τα τρία addSet μπορεί να πέσουν στο ίδιο ms).
    await db.sets.update(si.id, { created_at: '2026-11-10T10:00:00.000Z' });
    await db.sets.update(sb.id, { created_at: '2026-11-10T10:01:00.000Z' });
    await db.sets.update(sq.id, { created_at: '2026-11-10T10:02:00.000Z' });

    const sourceOrder = (await getWorkoutDetail(w.id))!.exercises.map((e) => e.exerciseId);
    expect(sourceOrder).toEqual([incline.id, bench.id, squat.id]);

    const newId = await duplicateWorkoutToDate(w.id, '2026-11-09');
    const copyOrder = (await getWorkoutDetail(newId!))!.exercises.map((e) => e.exerciseId);
    expect(copyOrder).toEqual(sourceOrder);
  });
});

describe('setWorkoutDate — μετακινεί και το scheduled_session', () => {
  it('αλλάζει μέρα κρατώντας την ώρα και ευθυγραμμίζει το planned row', async () => {
    const w = await startWorkout('strength', '2026-11-10');
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w.id);
    const beforeHour = new Date(w.started_at).getHours();

    // Planned session δεμένη στην ίδια μέρα & workout.
    const sched = await createScheduledSession({
      date: '2026-11-10',
      title: 'Upper',
      program_id: null,
      program_day_id: null,
      activity_kind: 'strength',
      time: null,
      notes: null,
    });
    await db.scheduled_sessions.update(sched.id, { workout_id: w.id, status: 'done' });

    await setWorkoutDate(w.id, '2026-11-07');

    const after = (await db.workouts.get(w.id))!;
    expect(localDay(new Date(after.started_at))).toBe('2026-11-07');
    expect(new Date(after.started_at).getHours()).toBe(beforeHour);

    const linked = (await listScheduledSessions('2026-11-01', '2026-11-30')).filter(
      (s) => s.workout_id === w.id,
    );
    expect(linked).toHaveLength(1);
    expect(linked[0]!.date).toBe('2026-11-07');
  });
});
