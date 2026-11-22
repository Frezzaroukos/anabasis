import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './index';
import { SEED_EXERCISES } from './seeds';
import { setCurrentUserId } from './session';
import {
  addSet,
  endWorkout,
  getCurrentProfileDataCounts,
  getExerciseSummaries,
  getGamificationInput,
  getProfileStats,
  getRecentPRs,
  getTrainingInsights,
  getWorkoutDetail,
  startWorkout,
} from './queries';

/**
 * Ενιαίος ορισμός PR σε ΟΛΟΥΣ τους readers: το πρώτο σετ ποτέ μιας άσκησης
 * (baseline row) δεν είναι PR· ρεκόρ που ξεπέρασε προηγούμενη προπόνηση είναι.
 */
const bench = SEED_EXERCISES.find((e) => e.name === 'Bench Press')!;

beforeEach(async () => {
  setCurrentUserId('pr-baseline-readers');
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.workouts.clear();
  await db.sets.clear();
  await db.personal_records.clear();
});

const log = async (kg: number) => {
  const w = await startWorkout('strength');
  await addSet({ workout_id: w.id, exercise_id: bench.id, weight_kg: kg, bodyweight_kg: null, reps: 5, hold_seconds: null });
  await endWorkout(w.id);
  return w;
};

describe('PR baseline — every reader agrees', () => {
  it('one first-ever workout: 0 PRs everywhere, but baseline rows are still stored', async () => {
    const w = await log(80);
    expect((await db.personal_records.toArray()).length).toBeGreaterThan(0); // baseline μένει για σύγκριση

    expect(await getRecentPRs(50)).toHaveLength(0);
    expect((await getWorkoutDetail(w.id))!.prs).toHaveLength(0);
    expect((await getCurrentProfileDataCounts()).prs).toBe(0);
    expect((await getProfileStats('pr-baseline-readers')).prs).toBe(0);
    expect((await getTrainingInsights(30)).prsThisPeriod).toBe(0);
    expect((await getGamificationInput()).prCount).toBe(0);
    expect((await getExerciseSummaries()).get(bench.id)?.hasPR).toBe(false);
  });

  it('a heavier second workout: real PRs appear; the first workout still shows none', async () => {
    const w1 = await log(80);
    await new Promise((r) => setTimeout(r, 5));
    const w2 = await log(90);

    expect((await getRecentPRs(50)).length).toBeGreaterThan(0);
    expect((await getWorkoutDetail(w1.id))!.prs).toHaveLength(0);
    const d2 = (await getWorkoutDetail(w2.id))!.prs;
    expect(d2.length).toBeGreaterThan(0);
    expect(d2.every((r) => r.workout_id === w2.id)).toBe(true);

    const counts = await getCurrentProfileDataCounts();
    expect(counts.prs).toBe(d2.length);
    expect((await getGamificationInput()).prCount).toBe(d2.length);
    expect((await getTrainingInsights(30)).prsThisPeriod).toBe(d2.length);
    expect((await getExerciseSummaries()).get(bench.id)?.hasPR).toBe(true);
  });
});
