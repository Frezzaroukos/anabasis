import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { db } from './index';
import { SEED_EXERCISES } from './seeds';
import { addSet, endWorkout, startWorkout } from './queries';
import { getCurrentUserId, setCurrentUserId } from './session';
import {
  getCategoryDistribution,
  getPRTimeline,
  getWeeklyFrequencySeries,
  getWeeklyVolumeSeries,
} from './analyticsQueries';

/**
 * Το DB κομμάτι των analytics: join workouts↔sets, φίλτρα εύρους και το
 * «μόνο ολοκληρωμένες» της συχνότητας. Τα μαθηματικά καλύπτονται στο
 * analytics.pure.test.ts — εδώ ελέγχουμε ότι τα δεδομένα φτάνουν σωστά.
 */
describe('analyticsQueries', () => {
  let original: string;
  const pullup = SEED_EXERCISES.find((e) => e.name === 'Pull-ups')!;
  const dips = SEED_EXERCISES.find((e) => e.name === 'Dips')!;

  beforeAll(async () => {
    original = getCurrentUserId();
    setCurrentUserId('analytics-queries-profile');
    await db.exercises.bulkPut(SEED_EXERCISES);
  });

  afterAll(() => {
    setCurrentUserId(original);
  });

  it('εβδομαδιαίος όγκος: BW + πρόσθετο, και warm-up με μόνο set_type εξαιρείται', async () => {
    const w = await startWorkout('strength');
    await addSet({
      workout_id: w.id,
      exercise_id: pullup.id,
      weight_kg: 20,
      bodyweight_kg: 80,
      reps: 5,
      hold_seconds: null,
    });
    // is_warmup=false αλλά set_type='warmup' — το παλιό φίλτρο το μετρούσε.
    await addSet({
      workout_id: w.id,
      exercise_id: pullup.id,
      weight_kg: 999,
      bodyweight_kg: null,
      reps: 99,
      hold_seconds: null,
      set_type: 'warmup',
    });

    const series = await getWeeklyVolumeSeries(4);
    const current = series.at(-1)!;
    expect(current.volume).toBe(500); // (80+20) × 5
    expect(current.sets).toBe(1);
    expect(series).toHaveLength(4);
  });

  it('συχνότητα: μόνο ολοκληρωμένες προπονήσεις, όχι η ενεργή', async () => {
    const before = (await getWeeklyFrequencySeries(4)).at(-1)!.sessions;
    const active = await startWorkout('strength');
    expect((await getWeeklyFrequencySeries(4)).at(-1)!.sessions).toBe(before);
    await endWorkout(active.id);
    expect((await getWeeklyFrequencySeries(4)).at(-1)!.sessions).toBe(before + 1);
  });

  it('κατανομή ανά κατηγορία: μετρά working σετ και ξέρει την κατηγορία της άσκησης', async () => {
    const w = await startWorkout('strength');
    await addSet({
      workout_id: w.id,
      exercise_id: dips.id,
      weight_kg: null,
      bodyweight_kg: 80,
      reps: 8,
      hold_seconds: null,
    });
    const slices = await getCategoryDistribution(30);
    expect(slices.find((s) => s.category === 'push')?.sets).toBe(1);
    expect(slices.find((s) => s.category === 'pull')?.sets).toBe(1);
  });

  it('PR timeline: σωρευτικά σημεία με όνομα άσκησης', async () => {
    const points = await getPRTimeline(30);
    expect(points.length).toBeGreaterThan(0);
    const last = points.at(-1)!;
    expect(last.cumulative).toBeGreaterThan(0);
    expect(last.events.some((e) => e.name === 'Pull-ups' || e.name === 'Dips')).toBe(true);
  });
});
