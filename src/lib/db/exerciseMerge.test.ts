import { describe, expect, it, beforeAll } from 'vitest';
import { db } from './index';
import { bootstrapDB } from './bootstrap';
import { addSet, createExercise, startWorkout, listExercises } from './queries';
import { createGoal, listGoals } from './goals';
import { getMergeImpact, mergeExercises } from './exerciseMerge';

beforeAll(async () => {
  await bootstrapDB();
});

async function logSet(workoutId: string, exerciseId: string, weight: number, reps: number) {
  return addSet({
    workout_id: workoutId,
    exercise_id: exerciseId,
    weight_kg: weight,
    bodyweight_kg: null,
    reps,
    hold_seconds: null,
  });
}

describe('mergeExercises', () => {
  it('ξαναγονεϊκοποιεί sets + PRs + αρχειοθετεί την πηγή', async () => {
    const source = await createExercise({ name: 'Merge Pull Ups BW' });
    const target = await createExercise({ name: 'Merge Pull Ups Weighted' });
    const w = await startWorkout('strength');
    // 2 σετ στην πηγή (το 2ο σπάει PR max_reps), 1 στον στόχο.
    await logSet(w.id, source.id, 0, 8);
    await logSet(w.id, source.id, 0, 12);
    await logSet(w.id, target.id, 20, 5);

    const srcSetsBefore = await db.sets.where('exercise_id').equals(source.id).count();
    expect(srcSetsBefore).toBe(2);

    await mergeExercises(source.id, target.id);

    // Πηγή άδεια + αρχειοθετημένη.
    expect(await db.sets.where('exercise_id').equals(source.id).count()).toBe(0);
    expect((await db.exercises.get(source.id))?.is_archived).toBe(true);

    // Στόχος έχει και τα 3 σετ.
    expect(await db.sets.where('exercise_id').equals(target.id).count()).toBe(3);

    // Κανένα PR δεν μένει «ορφανό» στην πηγή· όλα re-parented.
    expect(await db.personal_records.where('exercise_id').equals(source.id).count()).toBe(0);
    const targetPRs = await db.personal_records.where('exercise_id').equals(target.id).count();
    expect(targetPRs).toBeGreaterThan(0);
  });

  it('no-op για ίδια/κενά ids', async () => {
    const e = await createExercise({ name: 'Merge Noop' });
    await mergeExercises(e.id, e.id);
    await mergeExercises('', e.id);
    expect((await db.exercises.get(e.id))?.is_archived).toBeFalsy();
  });

  it('dedup στόχων: δεν αφήνει δύο ίδιους στόχους για την ίδια άσκηση', async () => {
    const source = await createExercise({ name: 'Merge Goal Src' });
    const target = await createExercise({ name: 'Merge Goal Tgt' });
    // Ίδιος στόχος (metric+period) και στις δύο ασκήσεις.
    await createGoal({ metric: 'sessions', target: 2, period: 'week', exercise_id: source.id });
    await createGoal({ metric: 'sessions', target: 3, period: 'week', exercise_id: target.id });

    await mergeExercises(source.id, target.id);

    const goals = await listGoals();
    const forTarget = goals.filter((g) => g.exercise_id === target.id && g.metric === 'sessions' && g.period === 'week');
    expect(forTarget.length).toBe(1); // το διπλότυπο της πηγής soft-deleted
    expect(goals.some((g) => g.exercise_id === source.id)).toBe(false);
  });

  it('η ενωμένη πηγή δεν εμφανίζεται στη λίστα ενεργών ασκήσεων', async () => {
    const source = await createExercise({ name: 'Merge Dupe A' });
    const target = await createExercise({ name: 'Merge Dupe B' });
    await mergeExercises(source.id, target.id);
    const active = await listExercises();
    expect(active.some((e) => e.id === source.id)).toBe(false);
    expect(active.some((e) => e.id === target.id)).toBe(true);
  });

  it('μετά την ένωση τα PR του στόχου ξαναχτίζονται σωστά από τα live σετ (κορυφή = 30kg)', async () => {
    const source = await createExercise({ name: 'Merge PR Dup Src' });
    const target = await createExercise({ name: 'Merge PR Dup Tgt' });
    const w = await startWorkout('strength');
    await logSet(w.id, source.id, 20, 5);
    await logSet(w.id, target.id, 30, 3);

    await mergeExercises(source.id, target.id);

    const live = (
      await db.personal_records.where('exercise_id').equals(target.id).toArray()
    ).filter((r) => r.deleted_at == null && r.activity_kind == null);
    // Η χρονοσειρά είναι ταξινομημένη χρονικά και κάθε row ξεπερνά το προηγούμενο
    // του ιδίου τύπου (ιδιότητα της detectPRs/recompute — όχι σταθερό πλήθος).
    for (const type of new Set(live.map((r) => r.type))) {
      const seq = live
        .filter((r) => r.type === type)
        .sort((a, b) => a.achieved_at.localeCompare(b.achieved_at));
      for (let i = 1; i < seq.length; i += 1) {
        expect(seq[i]!.value).toBeGreaterThan(seq[i - 1]!.value);
      }
    }
    // Το καλύτερο βάρος (30) είναι η κορυφή — η πηγή δεν είχε μεγαλύτερο.
    const maxWeight = live.filter((r) => r.type === 'max_weight');
    expect(Math.max(...maxWeight.map((r) => r.value))).toBe(30);
  });

  it('getMergeImpact μετρά τις εγγραφές που θα μετακινηθούν', async () => {
    const source = await createExercise({ name: 'Merge Impact Src' });
    const target = await createExercise({ name: 'Merge Impact Tgt' });
    const w = await startWorkout('strength');
    await logSet(w.id, source.id, 10, 5);
    await logSet(w.id, source.id, 10, 6);
    await createGoal({ metric: 'sessions', target: 2, period: 'week', exercise_id: source.id });

    const impact = await getMergeImpact(source.id, target.id);
    expect(impact.sets).toBe(2);
    expect(impact.goals).toBe(1);
    expect(impact.total).toBeGreaterThanOrEqual(3);

    // Ίδια/κενά ids → μηδέν.
    expect((await getMergeImpact(source.id, source.id)).total).toBe(0);
    expect((await getMergeImpact('', target.id)).total).toBe(0);
  });
});
