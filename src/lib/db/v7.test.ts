import { describe, expect, it, beforeAll } from 'vitest';
import { db } from './index';
import { bootstrapDB } from './bootstrap';
import { SEED_EXERCISES } from './seeds';
import { setCurrentUserId, DEFAULT_USER_ID } from './session';
import {
  addProgramExercise,
  addProgramExercisesBulk,
  createProgram,
  duplicateProgram,
  endWorkout,
  getActivityPRs,
  getLastPerformance,
  getProgramAdherence,
  getProgramWithExercises,
  getRecentPRs,
  getTrainingHeat,
  getTrainingInsights,
  getFeelTrend,
  localDay,
  setProgramTarget,
  startWorkout,
  updateWorkoutDistance,
  addSet,
} from './queries';

beforeAll(async () => {
  await bootstrapDB();
  setCurrentUserId(DEFAULT_USER_ID);
});

const bench = () => SEED_EXERCISES.find((e) => e.name === 'Bench Press')!;
const squat = () => SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;

async function runOf(distanceKm: number | null, durationPadSec: number) {
  const w = await startWorkout('run');
  if (distanceKm != null) await updateWorkoutDistance(w.id, distanceKm);
  // «στήνουμε» τη διάρκεια πίσω στο χρόνο ώστε το endWorkout να τη μετρήσει
  await db.workouts.update(w.id, {
    started_at: new Date(Date.now() - durationPadSec * 1000).toISOString(),
  });
  await endWorkout(w.id);
  return w;
}

describe('F06 — PRs για δραστηριότητες χωρίς σετ', () => {
  it('καταγράφει longest_distance PR σε τρέξιμο', async () => {
    await runOf(5, 1500);
    let prs = await getActivityPRs('run');
    expect(prs.get('longest_distance')?.value).toBe(5);

    // μεγαλύτερη απόσταση → νέο PR
    await runOf(8, 2400);
    prs = await getActivityPRs('run');
    expect(prs.get('longest_distance')?.value).toBe(8);

    // μικρότερη απόσταση → ΔΕΝ σπάει το ρεκόρ
    await runOf(3, 900);
    prs = await getActivityPRs('run');
    expect(prs.get('longest_distance')?.value).toBe(8);
  });

  it('ο ρυθμός είναι PR όταν ΜΕΙΩΝΕΤΑΙ (lower is better)', async () => {
    // 5km σε 1500s = 300 s/km
    await runOf(5, 1500);
    let prs = await getActivityPRs('run');
    const firstPace = prs.get('fastest_pace')!.value;
    expect(firstPace).toBeCloseTo(300, 5);

    // 5km σε 1200s = 240 s/km → ΤΑΧΥΤΕΡΟ → νέο PR
    await runOf(5, 1200);
    prs = await getActivityPRs('run');
    expect(prs.get('fastest_pace')!.value).toBeCloseTo(240, 5);

    // 5km σε 1800s = 360 s/km → ΠΙΟ ΑΡΓΟ → ΔΕΝ σπάει
    await runOf(5, 1800);
    prs = await getActivityPRs('run');
    expect(prs.get('fastest_pace')!.value).toBeCloseTo(240, 5);
  });

  it('τα activity PRs εμφανίζονται στο getRecentPRs μαζί με τα strength', async () => {
    const w = await startWorkout('strength');
    await addSet({
      workout_id: w.id, exercise_id: bench().id, weight_kg: 100,
      bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    await endWorkout(w.id);
    await runOf(10, 3000);

    const recent = await getRecentPRs(50);
    expect(recent.some((r) => r.exercise_id === bench().id)).toBe(true);
    expect(recent.some((r) => r.activity_kind === 'run' && r.exercise_id === null)).toBe(true);
  });

  it('δεν παράγει activity PR όταν δεν υπάρχει ούτε απόσταση ούτε διάρκεια', async () => {
    const w = await startWorkout('basketball');
    await db.workouts.update(w.id, { started_at: new Date().toISOString() });
    await endWorkout(w.id); // ~0 διάρκεια, χωρίς distance
    const prs = await getActivityPRs('basketball');
    expect(prs.size).toBe(0);
  });
});

describe('F03 — getLastPerformance', () => {
  it('φέρνει το πιο πρόσφατο μη-warmup σετ μιας άσκησης', async () => {
    const w1 = await startWorkout('strength');
    await addSet({
      workout_id: w1.id, exercise_id: squat().id, weight_kg: 80,
      bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    await endWorkout(w1.id);

    const w2 = await startWorkout('strength');
    await addSet({
      workout_id: w2.id, exercise_id: squat().id, weight_kg: 90,
      bodyweight_kg: null, reps: 3, hold_seconds: null,
    });
    // warm-up μετά — ΔΕΝ πρέπει να επιστραφεί ως «last performance»
    await addSet({
      workout_id: w2.id, exercise_id: squat().id, weight_kg: 40,
      bodyweight_kg: null, reps: 10, hold_seconds: null, is_warmup: true,
    });
    await endWorkout(w2.id);

    const last = await getLastPerformance(squat().id);
    expect(last?.weight_kg).toBe(90);
    expect(last?.reps).toBe(3);
  });

  it('επιστρέφει null για άσκηση χωρίς ιστορικό', async () => {
    const untouched = SEED_EXERCISES.find((e) => e.name === 'Pistol Squat')!;
    expect(await getLastPerformance(untouched.id)).toBeNull();
  });
});

describe('F01/F02 — bulk add + duplicate program', () => {
  it('addProgramExercisesBulk βάζει διαδοχικά positions σε ένα call', async () => {
    const p = await createProgram('Bulk test');
    const rows = await addProgramExercisesBulk(p.id, [bench().id, squat().id, bench().id]);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    const data = await getProgramWithExercises(p.id);
    expect(data!.exercises).toHaveLength(3);
  });

  it('συνεχίζει τα positions πάνω από υπάρχουσες γραμμές', async () => {
    const p = await createProgram('Bulk test 2');
    await addProgramExercise(p.id, { exercise_id: bench().id });
    const rows = await addProgramExercisesBulk(p.id, [squat().id, squat().id]);
    expect(rows.map((r) => r.position)).toEqual([1, 2]);
  });

  it('duplicateProgram αντιγράφει γραμμές αλλά με νέα ανεξάρτητα ids', async () => {
    const orig = await createProgram('Upper A');
    await addProgramExercise(orig.id, {
      exercise_id: bench().id, target_sets: 4, target_reps: 8, set_type: 'superset', group_key: 'g1',
    });
    await addProgramExercise(orig.id, { exercise_id: squat().id, target_sets: 5 });

    const copy = await duplicateProgram(orig.id, 'Upper B');
    expect(copy!.name).toBe('Upper B');
    expect(copy!.id).not.toBe(orig.id);

    const copyData = await getProgramWithExercises(copy!.id);
    expect(copyData!.exercises).toHaveLength(2);
    expect(copyData!.exercises[0]!.target_reps).toBe(8);
    expect(copyData!.exercises[0]!.set_type).toBe('superset');
    // ανεξάρτητα ids — αλλαγή στο copy δεν αγγίζει το original
    const origData = await getProgramWithExercises(orig.id);
    expect(copyData!.exercises[0]!.id).not.toBe(origData!.exercises[0]!.id);
  });

  it('default όνομα «(2)» όταν δεν δοθεί', async () => {
    const orig = await createProgram('Legs');
    const copy = await duplicateProgram(orig.id);
    expect(copy!.name).toBe('Legs (2)');
  });
});

describe('F10 — στόχος συχνότητας ανά πρόγραμμα', () => {
  it('μετρά ολοκληρωμένες προπονήσεις αυτής της εβδομάδας έναντι στόχου', async () => {
    const p = await createProgram('Weekly PPL');
    await setProgramTarget(p.id, 3);

    // δύο ολοκληρωμένες προπονήσεις με το όνομα του προγράμματος
    for (let i = 0; i < 2; i++) {
      const w = await startWorkout('strength');
      await db.workouts.update(w.id, { workout_type: 'Weekly PPL' });
      await endWorkout(w.id);
    }

    const adh = await getProgramAdherence(p.id);
    expect(adh?.target).toBe(3);
    expect(adh?.completedThisWeek).toBe(2);
  });

  it('επιστρέφει null όταν δεν έχει οριστεί στόχος', async () => {
    const p = await createProgram('No target');
    expect(await getProgramAdherence(p.id)).toBeNull();
  });
});

describe('F08/F11 — insights & heatmap', () => {
  it('getTrainingHeat δίνει σωστό μήκος και μαρκάρει μέρες προπόνησης', async () => {
    const w = await startWorkout('strength');
    await addSet({
      workout_id: w.id, exercise_id: bench().id, weight_kg: 50,
      bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    await endWorkout(w.id);

    const heat = await getTrainingHeat(30);
    expect(heat).toHaveLength(30);
    const todayKey = heat[heat.length - 1]!.date;
    expect(heat.find((c) => c.date === todayKey)?.trained).toBe(true);
  });

  it('getTrainingInsights: streak τρέχουσας μέρας ≥ 1 μετά από προπόνηση', async () => {
    const ins = await getTrainingInsights(30);
    expect(ins.streakDays).toBeGreaterThanOrEqual(1);
    expect(ins.longestStreakDays).toBeGreaterThanOrEqual(ins.streakDays);
    expect(ins.adherencePct).not.toBeNull();
  });

  it('getFeelTrend αντιστοιχίζει το feel της ημέρας στον όγκο', async () => {
    const w = await startWorkout('strength');
    await addSet({
      workout_id: w.id, exercise_id: squat().id, weight_kg: 60,
      bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    await db.workouts.update(w.id, { feel: 4 });
    await endWorkout(w.id);

    const trend = await getFeelTrend(7);
    const today = trend.find((p) => p.date === localDay())!;
    expect(today.feel).toBe(4);
    expect(today.volume).toBeGreaterThan(0);
  });
});
