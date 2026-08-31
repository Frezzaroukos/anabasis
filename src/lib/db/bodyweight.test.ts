import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { db } from './index';
import { SEED_EXERCISES } from './seeds';
import {
  addSet,
  getExerciseProgress,
  getLatestBodyweight,
  saveBodyMetric,
  startWorkout,
} from './queries';
import { getCurrentUserId, setCurrentUserId } from './session';

/**
 * Το φορτίο μιας άσκησης σωματικού βάρους = σωματικό βάρος + πρόσθετο. Ο logger
 * «φωτογραφίζει» το βάρος σε κάθε σετ· εδώ κλειδώνουμε ότι (α) βρίσκουμε το
 * σωστό βάρος-της-στιγμής και (β) το chart μετρά bw+added, όχι μόνο added.
 */
describe('bodyweight → total-load linkage', () => {
  let original: string;
  beforeAll(async () => {
    original = getCurrentUserId();
    setCurrentUserId('bodyweight-linkage-profile');
    await db.exercises.bulkPut(SEED_EXERCISES);
  });
  afterAll(() => {
    setCurrentUserId(original);
  });

  it('getLatestBodyweight: πιο πρόσφατο βάρος έως την ημερομηνία, αλλιώς null', async () => {
    expect(await getLatestBodyweight('2026-01-01')).toBeNull();
    await saveBodyMetric('2026-01-10', { weight_kg: 70 });
    await saveBodyMetric('2026-02-10', { weight_kg: 72 });
    // ημέρα με μόνο βήματα (χωρίς βάρος) δεν πρέπει να «σβήνει» το προηγούμενο
    await saveBodyMetric('2026-02-20', { steps: 8000 });

    expect(await getLatestBodyweight('2026-01-05')).toBeNull(); // πριν από κάθε ζύγισμα
    expect(await getLatestBodyweight('2026-01-15')).toBe(70);
    expect(await getLatestBodyweight('2026-02-25')).toBe(72); // αγνοεί τη μέρα-χωρίς-βάρος
  });

  it('getExerciseProgress: topWeight = σωματικό βάρος + πρόσθετο', async () => {
    const pullup = SEED_EXERCISES.find((e) => e.is_bodyweight)!;
    const w = await startWorkout('strength');
    // weighted pull-up: σωματικό 72 + πρόσθετο 20 → φορτίο 92, ΟΧΙ 20
    await addSet({
      workout_id: w.id,
      exercise_id: pullup.id,
      weight_kg: 20,
      bodyweight_kg: 72,
      reps: 5,
      hold_seconds: null,
    });
    const progress = await getExerciseProgress(pullup.id, 365);
    expect(progress).toHaveLength(1);
    expect(progress[0]!.topWeight).toBe(92);
    expect(progress[0]!.e1rm).not.toBeNull(); // υπολογίζεται πλέον (πριν ήταν null)
  });

  it('καθαρό σετ σωματικού βάρους (χωρίς πρόσθετο) μετρά ως φορτίο το σωματικό βάρος', async () => {
    const dip = SEED_EXERCISES.filter((e) => e.is_bodyweight)[1] ?? SEED_EXERCISES.find((e) => e.is_bodyweight)!;
    const w = await startWorkout('strength');
    await addSet({
      workout_id: w.id,
      exercise_id: dip.id,
      weight_kg: null,
      bodyweight_kg: 72,
      reps: 8,
      hold_seconds: null,
    });
    const progress = await getExerciseProgress(dip.id, 365);
    expect(progress.at(-1)!.topWeight).toBe(72); // πριν: null/0
  });
});
