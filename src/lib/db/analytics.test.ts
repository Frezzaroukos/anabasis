import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { db } from './index';
import { SEED_EXERCISES } from './seeds';
import {
  addSet,
  getTrainingSummary,
  getVolumeTrend,
  hasAnyCompletedWorkout,
  startWorkout,
} from './queries';
import { getCurrentUserId, setCurrentUserId } from './session';

/**
 * Το chart είναι εύκολο να ψεύδεται: αν οι κενές ημέρες παραλείπονται,
 * ο άξονας συμπιέζεται και δείχνει συνεχή προπόνηση. Αυτό το ελέγχουμε ρητά.
 */
beforeAll(async () => {
  await db.exercises.bulkPut(SEED_EXERCISES);
});

describe('getVolumeTrend', () => {
  it('επιστρέφει ΜΙΑ εγγραφή ανά ημέρα, συμπεριλαμβανομένων των κενών', async () => {
    const trend = await getVolumeTrend(14);
    expect(trend).toHaveLength(14);
    expect(trend.every((p) => typeof p.volume === 'number')).toBe(true);
    // ημερομηνίες αύξουσες και μοναδικές
    const dates = trend.map((p) => p.date);
    expect(new Set(dates).size).toBe(14);
    expect([...dates].sort()).toEqual(dates);
  });

  it('προσμετρά working σετ και αγνοεί warm-ups', async () => {
    const squat = SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;
    const w = await startWorkout();
    const before = (await getTrainingSummary(14)).totalVolume;

    await addSet({
      workout_id: w.id, exercise_id: squat.id,
      weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    const afterWorking = (await getTrainingSummary(14)).totalVolume;
    expect(afterWorking).toBeGreaterThan(before);

    await addSet({
      workout_id: w.id, exercise_id: squat.id,
      weight_kg: 999, bodyweight_kg: null, reps: 99, hold_seconds: null, is_warmup: true,
    });
    expect((await getTrainingSummary(14)).totalVolume).toBe(afterWorking);
  });
});

/**
 * Το «κατέγραψε την πρώτη σου προπόνηση» hint βασιζόταν σε 30-μερο παράθυρο —
 * κάποιος με ιστορικό παλαιότερο από 30 μέρες το ξανάβλεπε σαν αρχάριος.
 * Ο έλεγχος πρέπει να είναι all-time.
 */
describe('hasAnyCompletedWorkout', () => {
  // Τα test files μοιράζονται μία fake-indexeddb + το global currentUserId,
  // οπότε επαναφέρουμε το προφίλ μετά ώστε να μη μολυνθούν επόμενα suites.
  let original: string;
  beforeAll(() => {
    original = getCurrentUserId();
    setCurrentUserId('analytics-has-workout-profile');
  });
  afterAll(() => {
    setCurrentUserId(original);
  });

  it('κενό προφίλ → false', async () => {
    expect(await hasAnyCompletedWorkout()).toBe(false);
  });

  it('ολοκληρωμένη προπόνηση >30 μερών → true, ενώ το 30-μερο totalSets μένει 0', async () => {
    const long = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const w = await startWorkout();
    await db.workouts.update(w.id, { started_at: long, ended_at: long });

    expect(await hasAnyCompletedWorkout()).toBe(true);
    // Καμία δραστηριότητα στις τελευταίες 30 μέρες — ακριβώς η περίπτωση του bug.
    expect((await getTrainingSummary(30)).totalSets).toBe(0);
  });

  it('διαγραμμένη προπόνηση δεν μετρά', async () => {
    setCurrentUserId('analytics-deleted-workout-profile');
    const w = await startWorkout();
    await db.workouts.update(w.id, { ended_at: new Date().toISOString(), deleted_at: new Date().toISOString() });
    expect(await hasAnyCompletedWorkout()).toBe(false);
  });
});
