import { describe, expect, it, beforeAll } from 'vitest';
import { db } from './index';
import { SEED_EXERCISES } from './seeds';
import { addSet, getTrainingSummary, getVolumeTrend, startWorkout } from './queries';

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
