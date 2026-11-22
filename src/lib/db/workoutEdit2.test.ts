import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import {
  addSet,
  endWorkout,
  getActivityPRs,
  getPRsByExercise,
  getRecentPRs,
  getWorkoutDetail,
  moveSetToExercise,
  recomputePRsForExercise,
  removeExerciseFromWorkout,
  reorderWorkoutExercises,
  restoreWorkout,
  setWorkoutTimes,
  softDeleteSet,
  softDeleteWorkout,
  startWorkout,
  startWorkoutFromCompleted,
  updateSet,
} from './queries';
import { SEED_EXERCISES } from './seeds';

/**
 * Η λογική των «παράγωγων» μετά από διόρθωση/διαγραφή: PR που
 * ξαναϋπολογίζονται, αναίρεση διαγραφής, μετακίνηση σετ, επανάληψη.
 * Κάθε test φυλάει μια συμπεριφορά που, αν χαλάσει, κάνει το app να λέει
 * ψέματα για την απόδοση του χρήστη.
 */
const squat = SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;
const bench = SEED_EXERCISES.find((e) => e.name === 'Bench Press')!;

beforeEach(async () => {
  setCurrentUserId('workout-edit2-profile');
  await db.exercises.clear();
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.workouts.clear();
  await db.sets.clear();
  await db.personal_records.clear();
});

async function completedWorkout(exerciseId: string, weight: number, reps: number) {
  const w = await startWorkout('strength');
  const s = await addSet({
    workout_id: w.id,
    exercise_id: exerciseId,
    weight_kg: weight,
    bodyweight_kg: null,
    reps,
    hold_seconds: null,
  });
  await endWorkout(w.id);
  return { w, s };
}

function bestPR(rows: { type: string; value: number; deleted_at?: string | null }[], type: string): number | null {
  const match = rows.filter((r) => r.type === type && r.deleted_at == null);
  return match.length ? Math.max(...match.map((r) => r.value)) : null;
}

/** Μόνο οι ΖΩΝΤΑΝΕΣ γραμμές (το recompute αφήνει tombstones για το sync). */
async function livePRs() {
  return (await db.personal_records.toArray()).filter((r) => r.deleted_at == null);
}

describe('PR recompute after edit / delete', () => {
  it('διορθώνει προς τα κάτω: το παλιό «μεγαλύτερο» ρεκόρ δεν μένει', async () => {
    const { s } = await completedWorkout(squat.id, 110, 5);
    const prs = await db.personal_records.toArray();
    expect(bestPR(prs, 'max_weight')).toBe(110);

    await updateSet(s.id, { weight_kg: 100 });

    const after = await db.personal_records.toArray();
    expect(bestPR(after, 'max_weight')).toBe(100);
  });

  it('σβήσιμο σετ ρίχνει το ρεκόρ στο αληθινό επόμενο καλύτερο', async () => {
    const w = await startWorkout('strength');
    const weak = await addSet({
      workout_id: w.id, exercise_id: squat.id, weight_kg: 90, bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    await addSet({
      workout_id: w.id, exercise_id: squat.id, weight_kg: 120, bodyweight_kg: null, reps: 3, hold_seconds: null,
    });
    await endWorkout(w.id);
    expect(bestPR(await db.personal_records.toArray(), 'max_weight')).toBe(120);

    // βρες το 120 και σβήσε το
    const sets = await db.sets.where('workout_id').equals(w.id).toArray();
    const heavy = sets.find((x) => x.weight_kg === 120)!;
    await softDeleteSet(heavy.id);

    const after = await db.personal_records.toArray();
    // Το 90 δεν ήταν PR όταν καταγράφηκε (είχε προηγηθεί το 120) — χωρίς
    // recompute το ρεκόρ θα χανόταν· με recompute γίνεται 90.
    expect(bestPR(after, 'max_weight')).toBe(90);
    // warm-up σιγουριά: το αδύναμο σετ υπάρχει ακόμη
    expect((await db.sets.get(weak.id))!.deleted_at).toBeNull();
  });

  it('warm-up σετ δεν παράγει PR ούτε μετά από recompute', async () => {
    const w = await startWorkout('strength');
    await addSet({
      workout_id: w.id, exercise_id: squat.id, weight_kg: 60, bodyweight_kg: null, reps: 5,
      hold_seconds: null, is_warmup: true, set_type: 'warmup',
    });
    await endWorkout(w.id);
    await recomputePRsForExercise(squat.id);
    expect(await livePRs()).toHaveLength(0);
  });
});

describe('restoreWorkout — undo διαγραφής', () => {
  it('επαναφέρει προπόνηση, σετ και ρεκόρ', async () => {
    const { w } = await completedWorkout(squat.id, 100, 5);
    await softDeleteWorkout(w.id);
    expect(await getWorkoutDetail(w.id)).toBeNull();
    expect(await livePRs()).toHaveLength(0);

    await restoreWorkout(w.id);

    const detail = await getWorkoutDetail(w.id);
    expect(detail).not.toBeNull();
    expect(detail!.totalSets).toBe(1);
    expect(bestPR(await db.personal_records.toArray(), 'max_weight')).toBe(100);
  });
});

describe('removeExerciseFromWorkout — σβήνει όλη την άσκηση', () => {
  it('soft-deletes κάθε σετ της άσκησης και κρατά τις άλλες', async () => {
    const w = await startWorkout('strength');
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await addSet({ workout_id: w.id, exercise_id: bench.id, weight_kg: 80, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w.id);

    await removeExerciseFromWorkout(w.id, squat.id);

    const detail = await getWorkoutDetail(w.id);
    expect(detail!.exercises.map((e) => e.exerciseId)).toEqual([bench.id]);
    // το bench PR επιβιώνει
    const benchPRs = (await livePRs()).filter((r) => r.exercise_id === bench.id);
    expect(benchPRs.length).toBeGreaterThan(0);
    const squatPRs = (await livePRs()).filter((r) => r.exercise_id === squat.id);
    expect(squatPRs).toHaveLength(0);
  });
});

describe('moveSetToExercise — λάθος άσκηση', () => {
  it('μετακινεί το σετ, ξαναριθμεί και ξαναχτίζει PR και των δύο', async () => {
    const w = await startWorkout('strength');
    const wrong = await addSet({
      workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    await addSet({ workout_id: w.id, exercise_id: bench.id, weight_kg: 60, bodyweight_kg: null, reps: 8, hold_seconds: null });
    await endWorkout(w.id);

    await moveSetToExercise(wrong.id, bench.id);

    const moved = (await db.sets.get(wrong.id))!;
    expect(moved.exercise_id).toBe(bench.id);
    // Έγινε το #2 στο bench
    expect(moved.set_number).toBe(2);
    // Το squat έχει τώρα 0 ζωντανά ρεκόρ· το bench κέρδισε max_weight 100
    const squatPRs = (await livePRs()).filter((r) => r.exercise_id === squat.id);
    expect(squatPRs).toHaveLength(0);
    const benchPRs = (await livePRs()).filter((r) => r.exercise_id === bench.id);
    expect(bestPR(benchPRs, 'max_weight')).toBe(100);
  });
});

describe('reorderWorkoutExercises — αναδιάταξη', () => {
  it('αλλάζει τη σειρά εμφάνισης στο detail χωρίς να αλλάξει δεδομένα', async () => {
    const w = await startWorkout('strength');
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await addSet({ workout_id: w.id, exercise_id: bench.id, weight_kg: 80, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w.id);

    let detail = await getWorkoutDetail(w.id);
    expect(detail!.exercises.map((e) => e.exerciseId)).toEqual([squat.id, bench.id]);

    await reorderWorkoutExercises(w.id, [bench.id, squat.id]);

    detail = await getWorkoutDetail(w.id);
    expect(detail!.exercises.map((e) => e.exerciseId)).toEqual([bench.id, squat.id]);
    expect(detail!.totalSets).toBe(2);
  });

  it('σφραγίζει updated_at στα σετ που άλλαξαν σειρά', async () => {
    const w = await startWorkout('strength');
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    const benchSet = await addSet({ workout_id: w.id, exercise_id: bench.id, weight_kg: 80, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w.id);
    await db.sets.update(benchSet.id, { updated_at: '2020-01-01T00:00:00.000Z' });

    await reorderWorkoutExercises(w.id, [bench.id, squat.id]);

    const after = (await db.sets.get(benchSet.id))!;
    expect(after.updated_at > '2020-01-01T00:00:00.000Z').toBe(true);
  });
});

describe('setWorkoutTimes — διόρθωση ώρας', () => {
  it('ορίζει ώρα έναρξης/λήξης και επανυπολογίζει τη διάρκεια', async () => {
    const { w } = await completedWorkout(squat.id, 100, 5);
    const ok = await setWorkoutTimes(w.id, { start: '18:00', end: '19:30' });
    expect(ok).toBe(true);
    const after = (await db.workouts.get(w.id))!;
    const start = new Date(after.started_at);
    const end = new Date(after.ended_at!);
    expect(start.getHours()).toBe(18);
    expect(start.getMinutes()).toBe(0);
    expect(end.getHours()).toBe(19);
    expect(end.getMinutes()).toBe(30);
    expect(after.duration_seconds).toBe(90 * 60);
  });

  it('απορρίπτει λήξη πριν την έναρξη', async () => {
    const { w } = await completedWorkout(squat.id, 100, 5);
    const before = (await db.workouts.get(w.id))!;
    const ok = await setWorkoutTimes(w.id, { start: '20:00', end: '18:00' });
    expect(ok).toBe(false);
    expect((await db.workouts.get(w.id))!.started_at).toBe(before.started_at);
  });

  it('αγνοεί άκυρη ώρα', async () => {
    const { w } = await completedWorkout(squat.id, 100, 5);
    expect(await setWorkoutTimes(w.id, { start: '99:99' })).toBe(false);
  });
});

describe('startWorkoutFromCompleted — repeat workout', () => {
  it('ξεκινά νέα άδεια ενεργή συνεδρία με όνομα/άθλημα της πηγής', async () => {
    const w = await startWorkout('strength', undefined, null, null, 'Upper A');
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await addSet({ workout_id: w.id, exercise_id: bench.id, weight_kg: 80, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w.id);

    const res = await startWorkoutFromCompleted(w.id);
    expect(res).not.toBeNull();
    expect(res!.workout.id).not.toBe(w.id);
    expect(res!.workout.workout_type).toBe('Upper A');
    expect(res!.workout.ended_at).toBeNull();
    expect(res!.exerciseNames).toEqual([squat.name, bench.name]);
    // Καμία αντιγραφή σετ — το νέο ξεκινά άδειο
    expect(await db.sets.where('workout_id').equals(res!.workout.id).count()).toBe(0);
  });

  it('επιστρέφει null όταν υπάρχει ήδη ενεργή προπόνηση', async () => {
    const w = await startWorkout('strength');
    await addSet({ workout_id: w.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w.id);
    // άφησε μια ενεργή
    await startWorkout('strength');

    const res = await startWorkoutFromCompleted(w.id);
    expect(res).toBeNull();
  });
});

describe('activity PR recompute', () => {
  it('διόρθωση διάρκειας τρεξίματος ενημερώνει το longest_duration', async () => {
    const w = await startWorkout('run');
    const { setWorkoutDuration } = await import('./queries');
    await endWorkout(w.id, 1200); // 20 λεπτά
    let prs = await getActivityPRs('run');
    expect(prs.get('longest_duration')?.value).toBe(1200);

    await setWorkoutDuration(w.id, 900); // 15 λεπτά — διόρθωση προς τα κάτω
    prs = await getActivityPRs('run');
    expect(prs.get('longest_duration')?.value).toBe(900);
  });
});

describe('PR soft-delete (sync tombstones) — ΔΕΝ γίνεται hard delete', () => {
  it('μετά από recompute, τα παλιά λάθος rows μένουν ως tombstones (deleted_at≠null)', async () => {
    const { s } = await completedWorkout(squat.id, 110, 5);
    const beforeIds = (await db.personal_records.toArray()).map((r) => r.id);
    expect(beforeIds.length).toBeGreaterThan(0);

    await updateSet(s.id, { weight_kg: 100 });

    const all = await db.personal_records.toArray();
    // Κάθε παλιό row υπάρχει ακόμη (δεν διαγράφηκε φυσικά)…
    for (const id of beforeIds) {
      const row = all.find((r) => r.id === id);
      expect(row).toBeTruthy();
    }
    const maxWeight = all.filter((r) => r.type === 'max_weight');
    // …και το παλιό 110 είναι πλέον tombstone, ενώ υπάρχει ζωντανό 100.
    expect(maxWeight.some((r) => r.value === 110 && r.deleted_at != null)).toBe(true);
    expect(maxWeight.some((r) => r.value === 100 && r.deleted_at == null)).toBe(true);
  });

  it('κανένας reader δεν επιστρέφει tombstoned PR', async () => {
    const { s } = await completedWorkout(squat.id, 110, 5);
    await updateSet(s.id, { weight_kg: 100 });

    const byEx = await getPRsByExercise();
    const squatPrs = byEx.get(squat.id) ?? [];
    expect(squatPrs.every((r) => r.deleted_at == null)).toBe(true);
    expect(Math.max(...squatPrs.filter((r) => r.type === 'max_weight').map((r) => r.value))).toBe(100);

    const recent = await getRecentPRs(50);
    expect(recent.every((r) => r.deleted_at == null)).toBe(true);
    expect(recent.some((r) => r.type === 'max_weight' && r.value === 110)).toBe(false);

    const detail = await getWorkoutDetail(s.workout_id);
    expect((detail!.prs ?? []).every((r) => r.deleted_at == null)).toBe(true);
  });

  it('recompute που δεν αλλάζει τίποτα δεν αλλάζει τα ids (δεν φουσκώνει server)', async () => {
    await completedWorkout(squat.id, 100, 5);
    const before = (await livePRs()).map((r) => r.id).sort();
    await recomputePRsForExercise(squat.id);
    const after = (await livePRs()).map((r) => r.id).sort();
    expect(after).toEqual(before);
    // Κανένα νέο tombstone (όλα τα rows παρέμειναν ζωντανά).
    expect((await db.personal_records.toArray()).every((r) => r.deleted_at == null)).toBe(true);
  });
});
