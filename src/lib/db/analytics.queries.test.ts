import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { db } from './index';
import { SEED_EXERCISES } from './seeds';
import { addSet, endWorkout, getExerciseProgress, startWorkout } from './queries';
import { getCurrentUserId, setCurrentUserId } from './session';
import {
  getCategoryDistribution,
  getPRTimeline,
  getTrainingHeatmap,
  getWeeklyCategorySets,
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

describe('analyticsQueries — tombstones & νέα charts', () => {
  let original: string;
  const pullup = SEED_EXERCISES.find((e) => e.name === 'Pull-ups')!;

  beforeAll(async () => {
    original = getCurrentUserId();
    setCurrentUserId('analytics-queries-profile-2');
    await db.exercises.bulkPut(SEED_EXERCISES);
  });
  afterAll(() => setCurrentUserId(original));

  it('PR timeline δεν μετρά tombstoned PRs', async () => {
    const t = new Date().toISOString();
    const base = {
      user_id: getCurrentUserId(),
      exercise_id: pullup.id,
      activity_kind: null,
      reps: 5,
      weight_kg: 10,
      achieved_at: t,
      workout_id: 'w-x',
      set_id: null,
      created_at: t,
      updated_at: t,
    };
    await db.personal_records.bulkAdd([
      { ...base, id: 'pr-live', type: 'max_reps', value: 5 },
      { ...base, id: 'pr-dead', type: 'max_weight', value: 10, deleted_at: t },
    ]);
    const points = await getPRTimeline(30);
    expect(points.at(-1)!.cumulative).toBe(1);
    expect(points.flatMap((p) => p.events).map((e) => e.type)).toEqual(['max_reps']);
  });

  it('heatmap: μόνο ολοκληρωμένες, όχι διαγραμμένες· weekly category εξαιρεί διαγραμμένα σετ', async () => {
    const done = await startWorkout('strength');
    await addSet({
      workout_id: done.id,
      exercise_id: pullup.id,
      weight_kg: null,
      bodyweight_kg: 80,
      reps: 5,
      hold_seconds: null,
    });
    const deletedSet = await addSet({
      workout_id: done.id,
      exercise_id: pullup.id,
      weight_kg: null,
      bodyweight_kg: 80,
      reps: 5,
      hold_seconds: null,
    });
    await db.sets.update(deletedSet.id, { deleted_at: new Date().toISOString() });
    await endWorkout(done.id);
    const active = await startWorkout('strength');
    const gone = await startWorkout('strength');
    await endWorkout(gone.id);
    await db.workouts.update(gone.id, { deleted_at: new Date().toISOString() });

    const heat = await getTrainingHeatmap(2);
    expect(heat.at(-1)!.sessions).toBe(1); // done μόνο — active/gone όχι
    expect(active.id).toBeTruthy();

    const weekly = await getWeeklyCategorySets(2);
    expect(weekly.at(-1)!.byCategory.pull).toBe(1);
  });
});

describe('getExerciseProgress — hold / maxReps / bodyweight', () => {
  let original: string;
  const pushup = SEED_EXERCISES.find((e) => e.is_bodyweight)!;

  beforeAll(async () => {
    original = getCurrentUserId();
    setCurrentUserId('analytics-progress-profile');
    await db.exercises.bulkPut(SEED_EXERCISES);
  });
  afterAll(() => setCurrentUserId(original));

  it('maxReps χωρίς φορτίο, hold ανά ημέρα, εξαιρεί warm-up και διαγραμμένα', async () => {
    const w = await startWorkout('strength');
    const mk = (over: Partial<Parameters<typeof addSet>[0]>) =>
      addSet({
        workout_id: w.id,
        exercise_id: pushup.id,
        weight_kg: null,
        bodyweight_kg: null,
        reps: null,
        hold_seconds: null,
        ...over,
      });
    await mk({ reps: 12 });
    await mk({ reps: 20 });
    await mk({ hold_seconds: 30 });
    await mk({ hold_seconds: 45 });
    await mk({ reps: 99, set_type: 'warmup' });
    const dead = await mk({ reps: 77, hold_seconds: 999 });
    await db.sets.update(dead.id, { deleted_at: new Date().toISOString() });

    const [p] = await getExerciseProgress(pushup.id, 30);
    expect(p!.maxReps).toBe(20);
    expect(p!.hold).toBe(45);
    expect(p!.topWeight).toBeNull(); // χωρίς καταγεγραμμένο φορτίο
  });

  it('με σωματικό βάρος: topWeight = bw + πρόσθετο', async () => {
    const w = await startWorkout('strength');
    await addSet({
      workout_id: w.id,
      exercise_id: pushup.id,
      weight_kg: 10,
      bodyweight_kg: 70,
      reps: 5,
      hold_seconds: null,
    });
    const [p] = await getExerciseProgress(pushup.id, 30);
    expect(p!.topWeight).toBe(80);
  });
});
