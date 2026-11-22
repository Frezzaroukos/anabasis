import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from './index';
import { SEED_EXERCISES } from './seeds';
import { addSet, endWorkout, recomputePRsForExercise, setWorkoutDate, startWorkout } from './queries';
import { getCurrentUserId, setCurrentUserId } from './session';

function dayStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const localDayOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('PR achieved_at ακολουθεί την ημέρα της προπόνησης', () => {
  let original: string;
  const dips = SEED_EXERCISES.find((e) => e.name === 'Dips')!;
  const pull = SEED_EXERCISES.find((e) => e.name === 'Pull-ups')!;

  beforeAll(async () => {
    original = getCurrentUserId();
    setCurrentUserId('pr-achieved-profile');
    await db.exercises.bulkPut(SEED_EXERCISES);
  });
  afterAll(() => setCurrentUserId(original));

  it('backdated προπόνηση (10 μέρες πριν) → PR με εκείνη την ημερομηνία', async () => {
    const w = await startWorkout('strength', dayStr(10));
    const set = await addSet({
      workout_id: w.id, exercise_id: dips.id, weight_kg: 20, bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    const prs = await db.personal_records.where('exercise_id').equals(dips.id).toArray();
    expect(prs.length).toBeGreaterThan(0);
    for (const pr of prs) expect(localDayOf(pr.achieved_at)).toBe(dayStr(10));
    expect(set.id).toBeTruthy();
  });

  it('live προπόνηση: κρατά την πραγματική ώρα του σετ', async () => {
    const w = await startWorkout('strength');
    const set = await addSet({
      workout_id: w.id, exercise_id: pull.id, weight_kg: 10, bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    const prs = await db.personal_records.where('exercise_id').equals(pull.id).toArray();
    expect(prs.every((p) => p.achieved_at === set.created_at)).toBe(true);
  });

  it('recompute κρατά την ημερομηνία του σετ που κρατά το ρεκόρ', async () => {
    const old = await startWorkout('strength', dayStr(20));
    await addSet({ workout_id: old.id, exercise_id: pull.id, weight_kg: 30, bodyweight_kg: null, reps: 3, hold_seconds: null });
    await recomputePRsForExercise(pull.id);
    const live = (await db.personal_records.where('exercise_id').equals(pull.id).toArray()).filter((r) => r.deleted_at == null);
    const maxWeight = live.find((r) => r.type === 'max_weight')!;
    expect(maxWeight.value).toBe(30);
    expect(localDayOf(maxWeight.achieved_at)).toBe(dayStr(20));
  });

  it('recompute διορθώνει ήδη αποθηκευμένο λάθος achieved_at, με ίδιο id', async () => {
    const w = await startWorkout('strength', dayStr(15));
    await addSet({ workout_id: w.id, exercise_id: dips.id, weight_kg: 40, bodyweight_kg: null, reps: 5, hold_seconds: null });
    const before = (await db.personal_records.where('exercise_id').equals(dips.id).toArray()).find(
      (r) => r.deleted_at == null && r.type === 'max_weight' && r.value === 40,
    )!;
    // προσομοίωση παλιού bug: «τώρα»
    await db.personal_records.update(before.id, { achieved_at: new Date().toISOString() });
    await recomputePRsForExercise(dips.id);
    const after = await db.personal_records.get(before.id);
    expect(after!.deleted_at ?? null).toBeNull();
    expect(localDayOf(after!.achieved_at)).toBe(dayStr(15));
  });

  it('activity PR σε backdated προπόνηση παίρνει την ημέρα της', async () => {
    const w = await startWorkout('run', dayStr(7));
    await db.workouts.update(w.id, { distance_km: 5, duration_seconds: 1500 });
    await endWorkout(w.id);
    const pr = (await db.personal_records.where('activity_kind').equals('run').toArray()).find((r) => r.workout_id === w.id);
    expect(pr).toBeTruthy();
    expect(localDayOf(pr!.achieved_at)).toBe(dayStr(7));
  });

  it('αλλαγή ημέρας προπόνησης (setWorkoutDate) μετακινεί και τα PR της', async () => {
    const lift = SEED_EXERCISES.find((e) => e.name === 'Weighted Dips') ?? dips;
    const w = await startWorkout('strength', dayStr(12));
    await addSet({ workout_id: w.id, exercise_id: lift.id, weight_kg: 77, bodyweight_kg: null, reps: 4, hold_seconds: null });
    const find = async () =>
      (await db.personal_records.where('exercise_id').equals(lift.id).toArray()).find(
        (r) => r.deleted_at == null && r.type === 'max_weight' && r.value === 77,
      )!;
    const before = await find();
    expect(localDayOf(before.achieved_at)).toBe(dayStr(12));
    await setWorkoutDate(w.id, dayStr(9));
    const after = await find();
    expect(after.id).toBe(before.id);
    expect(localDayOf(after.achieved_at)).toBe(dayStr(9));
  });
});
