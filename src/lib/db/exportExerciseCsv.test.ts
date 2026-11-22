import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from './index';
import { SEED_EXERCISES } from './seeds';
import { addSet, exportExerciseCsv, startWorkout } from './queries';
import { setCurrentUserId } from './session';

/**
 * Audit #13 (CSV κομμάτι): το export άσκησης έπαιρνε την ημερομηνία από το
 * UTC `set.created_at` και το ταξινομούσε με αυτό. Ένα backdated workout (ή
 * ένα σετ στις 01:30 τοπική) έδειχνε λάθος μέρα. Πηγή αλήθειας = η μέρα του
 * workout (`started_at`), όπως στο ημερολόγιο.
 */
const squat = SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;

beforeAll(async () => {
  await db.exercises.bulkPut(SEED_EXERCISES);
});

beforeEach(async () => {
  setCurrentUserId('exercise-csv-test');
  await db.workouts.clear();
  await db.sets.clear();
  await db.personal_records.clear();
});

describe('exportExerciseCsv', () => {
  it('χρησιμοποιεί τη μέρα του workout, όχι την UTC μέρα του created_at', async () => {
    const w = await startWorkout('strength', '2026-03-10');
    const set = await addSet({
      workout_id: w.id,
      exercise_id: squat.id,
      weight_kg: 100,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
    });

    const csv = await exportExerciseCsv(squat.id);
    const rows = csv.split('\n');
    expect(rows[0]).toBe('date,set_number,weight_kg,reps,hold_seconds,rpe,rir,e1rm,volume');
    const cols = rows[1]!.split(',');
    expect(cols[0]).toBe('2026-03-10');
    expect(cols.slice(2, 4)).toEqual(['100', '5']);

    // Απόδειξη ότι το παλιό (UTC created_at) θα έδινε άλλη μέρα.
    expect(set.created_at.slice(0, 10)).not.toBe('2026-03-10');
  });

  it('ταξινομεί με τη χρονολογική σειρά των workouts και μετά set_number', async () => {
    const recent = await startWorkout('strength', '2026-11-21');
    await addSet({
      workout_id: recent.id,
      exercise_id: squat.id,
      weight_kg: 100,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
    });

    const old = await startWorkout('strength', '2026-03-10');
    await addSet({
      workout_id: old.id,
      exercise_id: squat.id,
      weight_kg: 100,
      bodyweight_kg: null,
      reps: 3,
      hold_seconds: null,
    });
    await addSet({
      workout_id: old.id,
      exercise_id: squat.id,
      weight_kg: 90,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
    });

    const rows = (await exportExerciseCsv(squat.id)).split('\n').slice(1);
    expect(rows.map((l) => l.split(',')[0])).toEqual(['2026-03-10', '2026-03-10', '2026-11-21']);
    expect(rows.map((l) => l.split(',')[1])).toEqual(['1', '2', '1']);
  });
});
