import { describe, expect, it, beforeAll } from 'vitest';
import { db } from './index';
import { SEED_EXERCISES } from './seeds';
import {
  addSet, endWorkout, getBodyTrend, getCalendar, getExerciseProgress,
  localDay, saveBodyMetric, startWorkout,
} from './queries';

beforeAll(async () => {
  await db.exercises.bulkPut(SEED_EXERCISES);
});

describe('πολλαπλές δραστηριότητες την ίδια μέρα', () => {
  it('κρατά γυμναστήριο + μπάσκετ + τρέξιμο χωριστά', async () => {
    const gym = await startWorkout('strength');
    const ball = await startWorkout('basketball');
    const run = await startWorkout('run');
    await db.workouts.update(run.id, { distance_km: 5.2 });
    for (const w of [gym, ball, run]) await endWorkout(w.id);

    const today = localDay();
    const cal = await getCalendar(today, today);
    const day = cal.get(today);
    expect(day).toBeTruthy();
    expect(day!.workouts.length).toBeGreaterThanOrEqual(3);
    const kinds = day!.workouts.map((w) => w.kind);
    expect(kinds).toContain('strength');
    expect(kinds).toContain('basketball');
    expect(kinds).toContain('run');
    expect(day!.workouts.find((w) => w.kind === 'run')?.distanceKm).toBe(5.2);
  });
});

describe('τύποι σετ (dropset / superset)', () => {
  it('αποθηκεύει set_type και group_id', async () => {
    const bench = SEED_EXERCISES.find((e) => e.name === 'Bench Press')!;
    const curl = SEED_EXERCISES.find((e) => e.name === 'Biceps Curls')!;
    const w = await startWorkout('strength');
    const g = 'group-1';

    // superset: ίδιο group, ΔΙΑΦΟΡΕΤΙΚΕΣ ασκήσεις
    const a = await addSet({
      workout_id: w.id, exercise_id: bench.id, weight_kg: 60,
      bodyweight_kg: null, reps: 10, hold_seconds: null,
      set_type: 'superset', group_id: g,
    });
    const b = await addSet({
      workout_id: w.id, exercise_id: curl.id, weight_kg: 15,
      bodyweight_kg: null, reps: 12, hold_seconds: null,
      set_type: 'superset', group_id: g,
    });
    expect(a.set_type).toBe('superset');
    expect(a.group_id).toBe(g);
    expect(b.group_id).toBe(g);
    expect(a.exercise_id).not.toBe(b.exercise_id);

    // dropset: ίδιο group, ΙΔΙΑ άσκηση, φθίνον βάρος
    const d = 'group-drop';
    const d1 = await addSet({
      workout_id: w.id, exercise_id: bench.id, weight_kg: 60,
      bodyweight_kg: null, reps: 8, hold_seconds: null, set_type: 'dropset', group_id: d,
    });
    const d2 = await addSet({
      workout_id: w.id, exercise_id: bench.id, weight_kg: 45,
      bodyweight_kg: null, reps: 8, hold_seconds: null, set_type: 'dropset', group_id: d,
    });
    expect(d1.weight_kg! > d2.weight_kg!).toBe(true);
    expect(d1.group_id).toBe(d2.group_id);
  });

  it('default set_type = normal, warm-up = warmup', async () => {
    const w = await startWorkout('strength');
    const ex = SEED_EXERCISES[0]!;
    const n = await addSet({
      workout_id: w.id, exercise_id: ex.id, weight_kg: 50,
      bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    const u = await addSet({
      workout_id: w.id, exercise_id: ex.id, weight_kg: 20,
      bodyweight_kg: null, reps: 10, hold_seconds: null, is_warmup: true,
    });
    expect(n.set_type).toBe('normal');
    expect(u.set_type).toBe('warmup');
  });
});

describe('body metrics (βάρος / θερμίδες)', () => {
  it('upsert: δεύτερη εγγραφή ενημερώνει, δεν διπλασιάζει', async () => {
    const day = localDay();
    await saveBodyMetric(day, { weight_kg: 72.4 });
    await saveBodyMetric(day, { calories_in: 2600, calories_out: 2900 });
    const rows = await db.body_metrics.toArray();
    expect(rows.filter((r) => r.date === day)).toHaveLength(1);
    const m = rows.find((r) => r.date === day)!;
    expect(m.weight_kg).toBe(72.4);
    expect(m.calories_in).toBe(2600);
  });

  it('υπολογίζει έλλειμμα/πλεόνασμα και αφήνει null όπου λείπουν δεδομένα', async () => {
    const trend = await getBodyTrend(7);
    expect(trend).toHaveLength(7);
    const today = trend.find((p) => p.date === localDay())!;
    expect(today.balance).toBe(2600 - 2900); // έλλειμμα -300
    const empty = trend.find((p) => p.date !== localDay() && p.caloriesIn == null);
    expect(empty?.balance).toBeNull();
  });

  it('επιστρέφει και πρωτεΐνη / λίπος σώματος στη χρονοσειρά', async () => {
    const day = localDay();
    await saveBodyMetric(day, { protein_g: 165, body_fat_pct: 12.5 });
    const trend = await getBodyTrend(7);
    const today = trend.find((p) => p.date === day)!;
    expect(today.proteinG).toBe(165);
    expect(today.bodyFatPct).toBe(12.5);
    // μέρες χωρίς καταγραφή μένουν null — δεν γεμίζουμε με μηδενικά
    const other = trend.find((p) => p.date !== day)!;
    expect(other.proteinG).toBeNull();
    expect(other.bodyFatPct).toBeNull();
  });
});

describe('per-exercise progress', () => {
  it('κρατά το καλύτερο σετ ανά ημέρα και υπολογίζει e1RM', async () => {
    const squat = SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;
    const w = await startWorkout('strength');
    await addSet({
      workout_id: w.id, exercise_id: squat.id, weight_kg: 90,
      bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    await addSet({
      workout_id: w.id, exercise_id: squat.id, weight_kg: 110,
      bodyweight_kg: null, reps: 3, hold_seconds: null,
    });
    // warm-up δεν πρέπει να γίνει "top set"
    await addSet({
      workout_id: w.id, exercise_id: squat.id, weight_kg: 999,
      bodyweight_kg: null, reps: 1, hold_seconds: null, is_warmup: true,
    });
    const prog = await getExerciseProgress(squat.id, 30);
    const today = prog.find((p) => p.date === localDay())!;
    expect(today.topWeight).toBe(110);
    expect(today.e1rm).toBeGreaterThan(110);
    expect(today.volume).toBe(90 * 5 + 110 * 3);
  });
});
