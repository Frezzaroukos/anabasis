import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import {
  addSet,
  endWorkout,
  getPRsByExercise,
  recomputePRsForExercise,
  saveBodyMetric,
  startWorkout,
} from './queries';
import { SEED_EXERCISES } from './seeds';

/**
 * PR για ασκήσεις σωματικού βάρους: ΚΑΙ τα δύο.
 * - max_weight / e1rm = μόνο το πρόσθετο βάρος (όπως πριν).
 * - max_total_load / e1rm_total = σώμα + πρόσθετο, ώστε μια μέρα με σκέτο BW
 *   (χωρίς πρόσβαση σε βάρη) να μπορεί κι αυτή να σπάσει ρεκόρ.
 */
const squat = SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;
const EX = 'ex-bw-total-test';

beforeEach(async () => {
  setCurrentUserId('pr-total-profile');
  await db.exercises.clear();
  await db.exercises.bulkPut([
    ...SEED_EXERCISES,
    { ...squat, id: EX, name: 'Weighted Dip (test)', is_bodyweight: true, user_id: null },
  ]);
  await db.workouts.clear();
  await db.sets.clear();
  await db.personal_records.clear();
  await db.body_metrics.clear();
});

async function logSet(weight: number | null, bw: number | null, reps: number, exerciseId = EX) {
  const w = await startWorkout('strength');
  const res = await addSet({
    workout_id: w.id,
    exercise_id: exerciseId,
    weight_kg: weight,
    bodyweight_kg: bw,
    reps,
    hold_seconds: null,
  });
  await endWorkout(w.id);
  return res;
}

async function best(type: string, exerciseId = EX): Promise<number | null> {
  const rows = ((await getPRsByExercise()).get(exerciseId) ?? []).filter((r) => r.type === type);
  return rows.length ? Math.max(...rows.map((r) => r.value)) : null;
}

describe('bodyweight PRs — added AND total load', () => {
  it('κρατά και τα δύο: πρόσθετο (max_weight) και συνολικό (max_total_load)', async () => {
    await logSet(20, 75, 5);
    expect(await best('max_weight')).toBe(20);
    expect(await best('max_total_load')).toBe(95);
    expect(await best('e1rm_total')).toBeCloseTo(95 * (1 + 5 / 30), 5);
  });

  it('μέρα μόνο με BW (χωρίς βάρη) σπάει ρεκόρ e1RM συνολικού, όχι πρόσθετου', async () => {
    await logSet(10, 75, 3); // total 85 × 3 → e1RM ≈ 93.5
    const res = await logSet(null, 75, 15); // total 75 × 15 → e1RM = 112.5
    expect(res.newPRs).toContain('e1rm_total');
    expect(res.newPRs).not.toContain('e1rm');
    expect(res.newPRs).not.toContain('max_weight');
    expect(await best('max_weight')).toBe(10);
    expect(await best('e1rm_total')).toBeCloseTo(112.5, 5);
  });

  it('χωρίς γνωστό σωματικό βάρος δεν γράφεται συνολικό ρεκόρ (όχι επινοημένα νούμερα)', async () => {
    await logSet(20, null, 5);
    expect(await best('max_weight')).toBe(20);
    expect(await best('max_total_load')).toBeNull();
  });

  it('ασκήσεις με βάρη (χωρίς σώμα) δεν παίρνουν total τύπους', async () => {
    await logSet(100, null, 5, squat.id);
    expect(await best('max_total_load', squat.id)).toBeNull();
    expect(await best('e1rm_total', squat.id)).toBeNull();
  });

  it('νέος (late) τύπος δεν γιορτάζεται όταν δεν υπάρχει ακόμα προηγούμενο ίδιου τύπου', async () => {
    await logSet(20, 75, 5);
    // Προσομοίωση παλιών δεδομένων πριν το update: σβήνουμε τα total rows.
    const rows = await db.personal_records.toArray();
    await db.personal_records.bulkDelete(
      rows.filter((r) => r.type === 'max_total_load' || r.type === 'e1rm_total').map((r) => r.id),
    );
    const res = await logSet(10, 75, 3); // χειρότερο σε όλα — total γράφεται, αλλά δεν είναι «σπάσιμο»
    expect(res.newPRs).toEqual([]);
    expect(await best('max_total_load')).toBe(85);
  });

  it('το live PR συγκρίνεται με το ΚΑΛΥΤΕΡΟ ιστορικό, όχι με το πρώτο', async () => {
    await logSet(10, 75, 5);
    await logSet(30, 75, 5);
    const res = await logSet(20, 75, 5); // καλύτερο από το πρώτο, χειρότερο από το δεύτερο
    expect(res.newPRs).toEqual([]);
    await recomputePRsForExercise(EX);
    expect(await best('max_weight')).toBe(30);
  });

  it('παλιά σετ χωρίς σωματικό βάρος: μέτρηση με παλιά ημερομηνία γεμίζει τα συνολικά ρεκόρ', async () => {
    await logSet(20, null, 5); // ιστορικό πριν μετρηθεί ποτέ βάρος
    expect(await best('max_total_load')).toBeNull();
    await saveBodyMetric('2000-01-01', { weight_kg: 75 }); // πριν από την προπόνηση
    expect(await best('max_total_load')).toBe(95);
    expect(await best('max_weight')).toBe(20);
  });

  it('μέτρηση ΜΕΤΑ την προπόνηση δεν χρησιμοποιείται (ποτέ από το μέλλον)', async () => {
    await logSet(20, null, 5);
    await saveBodyMetric('2999-01-01', { weight_kg: 75 });
    expect(await best('max_total_load')).toBeNull();
  });
});
