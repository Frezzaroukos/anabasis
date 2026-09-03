import { describe, expect, it, beforeAll } from 'vitest';
import { db } from './index';
import { SEED_EXERCISES } from './seeds';
import {
  addProgramExercise,
  addSet,
  createProgram,
  endWorkout,
  getProgramWithExercises,
  listPrograms,
  programFromLastWorkout,
  removeProgramExercise,
  renameProgram,
  reorderProgramExercises,
  softDeleteProgram,
  startWorkout,
  startWorkoutFromLastOfKind,
  startWorkoutFromProgram,
  updateProgramExercise,
} from './queries';

beforeAll(async () => {
  await db.exercises.bulkPut(SEED_EXERCISES);
});

const bench = () => SEED_EXERCISES.find((e) => e.name === 'Bench Press')!;
const curl = () => SEED_EXERCISES.find((e) => e.name === 'Biceps Curls')!;
const squat = () => SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;

describe('προγράμματα — CRUD', () => {
  it('δημιουργεί, μετονομάζει και κρύβει με soft delete', async () => {
    const p = await createProgram('Push A');
    expect(p.activity_kind).toBe('strength');
    expect(p.deleted_at).toBeNull();

    await renameProgram(p.id, 'Push A2');
    const listed = await listPrograms();
    expect(listed.find((x) => x.id === p.id)?.name).toBe('Push A2');

    await softDeleteProgram(p.id);
    expect((await listPrograms()).some((x) => x.id === p.id)).toBe(false);
    // soft delete = η εγγραφή μένει, απλώς δεν εμφανίζεται
    expect(await db.programs.get(p.id)).toBeTruthy();
  });

  it('κρατά σταθερή σειρά εμφάνισης (display_order)', async () => {
    const a = await createProgram('Ζ τελευταίο αλφαβητικά');
    const b = await createProgram('Α πρώτο αλφαβητικά');
    const ids = (await listPrograms()).map((x) => x.id);
    // σειρά δημιουργίας, όχι αλφαβητική — ο χρήστης ορίζει τη σειρά του
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
  });
});

describe('γραμμές προγράμματος', () => {
  it('αποδίδει διαδοχικά positions και τα ξαναγράφει στην αναδιάταξη', async () => {
    const p = await createProgram('Full body');
    const r1 = await addProgramExercise(p.id, { exercise_id: bench().id, target_sets: 4 });
    const r2 = await addProgramExercise(p.id, { exercise_id: curl().id, target_sets: 3 });
    const r3 = await addProgramExercise(p.id, { exercise_id: squat().id, target_sets: 5 });
    expect([r1.position, r2.position, r3.position]).toEqual([0, 1, 2]);

    await reorderProgramExercises([r3.id, r1.id, r2.id]);
    const data = (await getProgramWithExercises(p.id))!;
    expect(data.exercises.map((e) => e.exercise_id)).toEqual([
      squat().id,
      bench().id,
      curl().id,
    ]);
    expect(data.exercises.map((e) => e.position)).toEqual([0, 1, 2]);
  });

  it('ενημερώνει στόχους και διαγράφει γραμμή', async () => {
    const p = await createProgram('Pull A');
    const row = await addProgramExercise(p.id, { exercise_id: bench().id });
    expect(row.set_type).toBe('normal');
    expect(row.target_reps).toBeNull();

    await updateProgramExercise(row.id, { target_reps: 8, target_weight_kg: 70 });
    const after = (await getProgramWithExercises(p.id))!.exercises[0]!;
    expect(after.target_reps).toBe(8);
    expect(after.target_weight_kg).toBe(70);

    await removeProgramExercise(row.id);
    expect((await getProgramWithExercises(p.id))!.exercises).toHaveLength(0);
  });

  it('ομαδοποιεί superset (διαφορετικές ασκήσεις) και dropset (ίδια, φθίνον βάρος)', async () => {
    const p = await createProgram('Arms');
    const gSuper = 'g-super';
    const s1 = await addProgramExercise(p.id, {
      exercise_id: bench().id, set_type: 'superset', group_key: gSuper,
    });
    const s2 = await addProgramExercise(p.id, {
      exercise_id: curl().id, set_type: 'superset', group_key: gSuper,
    });
    expect(s1.group_key).toBe(s2.group_key);
    expect(s1.exercise_id).not.toBe(s2.exercise_id);

    const gDrop = 'g-drop';
    const d1 = await addProgramExercise(p.id, {
      exercise_id: curl().id, set_type: 'dropset', group_key: gDrop, target_weight_kg: 20,
    });
    const d2 = await addProgramExercise(p.id, {
      exercise_id: curl().id, set_type: 'dropset', group_key: gDrop, target_weight_kg: 12,
    });
    expect(d1.group_key).toBe(d2.group_key);
    expect(d1.exercise_id).toBe(d2.exercise_id);
    expect(d1.target_weight_kg! > d2.target_weight_kg!).toBe(true);

    // οι δύο αλυσίδες δεν μπερδεύονται μεταξύ τους
    const rows = (await getProgramWithExercises(p.id))!.exercises;
    expect(rows.filter((r) => r.group_key === gSuper)).toHaveLength(2);
    expect(rows.filter((r) => r.group_key === gDrop)).toHaveLength(2);
  });
});

describe('έναρξη προπόνησης από πρόγραμμα', () => {
  it('φτιάχνει workout με το όνομα του προγράμματος αλλά ΧΩΡΙΣ σετ', async () => {
    const p = await createProgram('Leg day', 'strength');
    await addProgramExercise(p.id, { exercise_id: squat().id, target_sets: 5, target_reps: 5 });

    const res = (await startWorkoutFromProgram(p.id))!;
    expect(res.workout.workout_type).toBe('Leg day');
    expect(res.plan).toHaveLength(1);
    expect(res.plan[0]!.target_sets).toBe(5);

    // κρίσιμο: ένα καταγεγραμμένο σετ σημαίνει «το έκανα» — το πρόγραμμα είναι μόνο στόχος
    const written = await db.sets.where('workout_id').equals(res.workout.id).count();
    expect(written).toBe(0);
    await endWorkout(res.workout.id);
  });

  it('επιστρέφει null για ανύπαρκτο πρόγραμμα', async () => {
    expect(await startWorkoutFromProgram('δεν-υπάρχει')).toBeNull();
  });

  it('guard: αρνείται δεύτερη έναρξη όσο υπάρχει ήδη ενεργή προπόνηση', async () => {
    const p = await createProgram('Leg day', 'strength');
    await addProgramExercise(p.id, { exercise_id: squat().id, target_sets: 5, target_reps: 5 });

    const w = await startWorkout('strength');
    expect(await startWorkoutFromProgram(p.id)).toBeNull();
    // Καθαρίζουμε — αυτό το αρχείο δεν κάνει reset του db.workouts ανά test.
    await endWorkout(w.id);
  });
});

describe('πρόγραμμα από την τελευταία προπόνηση', () => {
  it('μετράει σετ ανά άσκηση, κρατά το βαρύτερο ως στόχο και αγνοεί τα warm-up', async () => {
    const w = await startWorkout('strength');
    for (const kg of [80, 100, 90]) {
      await addSet({
        workout_id: w.id, exercise_id: squat().id, weight_kg: kg,
        bodyweight_kg: null, reps: kg === 100 ? 3 : 5, hold_seconds: null,
      });
    }
    await addSet({
      workout_id: w.id, exercise_id: squat().id, weight_kg: 999,
      bodyweight_kg: null, reps: 1, hold_seconds: null, is_warmup: true,
    });
    await endWorkout(w.id);

    const p = (await programFromLastWorkout('Χθεσινό ξανά'))!;
    expect(p).toBeTruthy();
    const rows = (await getProgramWithExercises(p.id))!.exercises;
    const row = rows.find((r) => r.exercise_id === squat().id)!;
    expect(row.target_sets).toBe(3); // 3 κανονικά, το warm-up δεν μετράει
    expect(row.target_weight_kg).toBe(100); // το βαρύτερο, όχι το 999 του warm-up
    expect(row.target_reps).toBe(3); // οι επαναλήψεις ΤΟΥ βαρύτερου σετ
  });
});

describe('ξεκίνα σαν την τελευταία (χωρίς αποθηκευμένο πρόγραμμα)', () => {
  it('βρίσκει την πιο πρόσφατη ΟΛΟΚΛΗΡΩΜΕΝΗ προπόνηση αυτού του είδους και ξαναδίνει το ίδιο plan', async () => {
    const kind = 'lastkind-test';
    const w1 = await startWorkout(kind);
    await addSet({
      workout_id: w1.id, exercise_id: squat().id, weight_kg: 80,
      bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    await endWorkout(w1.id);

    // σε εξέλιξη — δεν μετράει ως "τελευταία ολοκληρωμένη"
    await startWorkout(kind);

    const started = (await startWorkoutFromLastOfKind(kind))!;
    expect(started).toBeTruthy();
    expect(started.workout.activity_kind).toBe(kind);
    expect(started.workout.id).not.toBe(w1.id);
    expect(started.plan).toHaveLength(1);
    expect(started.plan[0]!.exercise_id).toBe(squat().id);
    expect(started.plan[0]!.target_sets).toBe(1);
    expect(started.plan[0]!.target_weight_kg).toBe(80);

    // κρίσιμο: ίδιο συμβόλαιο με startWorkoutFromProgram — δεν γράφει σετ
    const written = await db.sets.where('workout_id').equals(started.workout.id).count();
    expect(written).toBe(0);
  });

  it('επιστρέφει null όταν δεν υπάρχει ολοκληρωμένη προπόνηση αυτού του είδους', async () => {
    expect(await startWorkoutFromLastOfKind('ανύπαρκτο-είδος-ever')).toBeNull();
  });
});
