import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import { createGoal, getGoalProgress, listGoals, deleteGoal, reorderGoals } from './goals';
import { addSet, endWorkout, startWorkout } from './queries';
import { SEED_EXERCISES } from './seeds';

/**
 * Ο υπολογιστής προόδου είναι ΕΝΑΣ για κάθε συνδυασμό μέτρου/περιόδου/εύρους,
 * οπότε τα tests καλύπτουν έναν εκπρόσωπο ανά κλάδο του υπολογισμού:
 * workout-level (sessions/distance/duration) και set-level (sets/reps/volume),
 * συν τα φίλτρα εύρους (άθλημα, άσκηση) και τους αποκλεισμούς (warm-up,
 * μη-ολοκληρωμένες προπονήσεις, εκτός παραθύρου).
 */

const squat = SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;
const bench = SEED_EXERCISES.find((e) => e.name === 'Bench Press')!;

beforeEach(async () => {
  setCurrentUserId('goals-test-profile');
  await db.exercises.bulkPut(SEED_EXERCISES);
  // Καθαρή αφετηρία: αυτά τα tests μετρούν αθροίσματα, οπότε υπολείμματα
  // από προηγούμενο test θα άλλαζαν κάθε νούμερο.
  await db.goals.clear();
  await db.workouts.clear();
  await db.sets.clear();
});

async function loggedWorkout(
  kind: string,
  sets: { exercise_id: string; weight: number; reps: number; warmup?: boolean }[],
) {
  const w = await startWorkout(kind);
  for (const s of sets) {
    await addSet({
      workout_id: w.id,
      exercise_id: s.exercise_id,
      weight_kg: s.weight,
      bodyweight_kg: null,
      reps: s.reps,
      hold_seconds: null,
      ...(s.warmup ? { set_type: 'warmup' as const, is_warmup: true } : {}),
    });
  }
  await endWorkout(w.id);
  return w;
}

describe('goals — μέτρηση προόδου', () => {
  it('sessions: μετρά ΜΟΝΟ ολοκληρωμένες προπονήσεις', async () => {
    await loggedWorkout('strength', [{ exercise_id: squat.id, weight: 100, reps: 5 }]);
    await startWorkout('strength'); // σε εξέλιξη — δεν πρέπει να μετρήσει

    const goal = await createGoal({ metric: 'sessions', target: 4, period: 'week' });
    const p = await getGoalProgress(goal);

    expect(p.current).toBe(1);
    expect(p.target).toBe(4);
    expect(p.ratio).toBeCloseTo(0.25);
  });

  it('volume_kg: αγνοεί τα warm-up σετ', async () => {
    await loggedWorkout('strength', [
      { exercise_id: squat.id, weight: 60, reps: 10, warmup: true }, // 600 — έξω
      { exercise_id: squat.id, weight: 100, reps: 5 }, // 500
      { exercise_id: squat.id, weight: 100, reps: 3 }, // 300
    ]);

    const goal = await createGoal({ metric: 'volume_kg', target: 1000, period: 'week' });
    expect((await getGoalProgress(goal)).current).toBe(800);
  });

  it('περιορίζεται σε μία άσκηση όταν δοθεί exercise_id', async () => {
    await loggedWorkout('strength', [
      { exercise_id: squat.id, weight: 100, reps: 5 },
      { exercise_id: bench.id, weight: 80, reps: 5 },
    ]);

    const goal = await createGoal({
      metric: 'sets',
      target: 10,
      period: 'week',
      exercise_id: squat.id,
    });
    expect((await getGoalProgress(goal)).current).toBe(1);
  });

  it('περιορίζεται σε ένα άθλημα όταν δοθεί activity_key', async () => {
    await loggedWorkout('strength', [{ exercise_id: squat.id, weight: 100, reps: 5 }]);
    await loggedWorkout('run', []);

    const runGoal = await createGoal({
      metric: 'sessions',
      target: 3,
      period: 'week',
      activity_key: 'run',
    });
    expect((await getGoalProgress(runGoal)).current).toBe(1);

    const allGoal = await createGoal({ metric: 'sessions', target: 3, period: 'week' });
    expect((await getGoalProgress(allGoal)).current).toBe(2);
  });

  it('αγνοεί προπονήσεις εκτός του παραθύρου της περιόδου', async () => {
    const old = await startWorkout('strength', '2024-01-01');
    await endWorkout(old.id);

    const goal = await createGoal({ metric: 'sessions', target: 4, period: 'week' });
    expect((await getGoalProgress(goal)).current).toBe(0);
  });

  it('reps: αθροίζει επαναλήψεις όλων των ασκήσεων', async () => {
    await loggedWorkout('strength', [
      { exercise_id: squat.id, weight: 100, reps: 5 },
      { exercise_id: bench.id, weight: 80, reps: 8 },
    ]);

    const goal = await createGoal({ metric: 'reps', target: 50, period: 'month' });
    expect((await getGoalProgress(goal)).current).toBe(13);
  });

  it('ratio κόβεται στο 1 αλλά το current κρατά την αλήθεια', async () => {
    await loggedWorkout('strength', [{ exercise_id: squat.id, weight: 100, reps: 5 }]);
    await loggedWorkout('strength', [{ exercise_id: squat.id, weight: 100, reps: 5 }]);

    const goal = await createGoal({ metric: 'sessions', target: 1, period: 'week' });
    const p = await getGoalProgress(goal);
    expect(p.ratio).toBe(1);
    expect(p.current).toBe(2);
  });

  it('στόχος με target 0 δεν σκάει σε διαίρεση', async () => {
    const goal = await createGoal({ metric: 'sessions', target: 0, period: 'week' });
    expect((await getGoalProgress(goal)).ratio).toBe(0);
  });
});

describe('goals — CRUD', () => {
  it('soft delete: ο στόχος φεύγει από τη λίστα αλλά μένει η εγγραφή', async () => {
    const g = await createGoal({ metric: 'sessions', target: 3, period: 'week' });
    await deleteGoal(g.id);

    expect(await listGoals(true)).toHaveLength(0);
    expect(await db.goals.get(g.id)).toBeTruthy();
  });

  it('η αναδιάταξη γράφει display_order κατά σειρά', async () => {
    const a = await createGoal({ metric: 'sessions', target: 3, period: 'week' });
    const b = await createGoal({ metric: 'volume_kg', target: 5000, period: 'week' });

    await reorderGoals([b.id, a.id]);
    expect((await listGoals()).map((g) => g.id)).toEqual([b.id, a.id]);
  });
});
