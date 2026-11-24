import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './index';
import { SEED_EXERCISES } from './seeds';
import { setCurrentUserId } from './session';
import {
  addSet,
  endWorkout,
  recomputePRsForExercise,
  softDeleteSet,
  startWorkout,
} from './queries';
import { realPRs, xpPRs } from '../domain/prBaseline';
import { LATE_PR_TYPES } from '../domain/pr';
import type { PersonalRecord, PRType } from './types';

/**
 * PR-2: «περισσότερες reps με ίδιο φορτίο» και reps-ισοδύναμο σε ασκήσεις
 * σώματος — μέσα από το πραγματικό addSet / recompute πάνω στο IndexedDB
 * (fake-indexeddb).
 */
const pull = SEED_EXERCISES.find((e) => e.name === 'Pull-ups')!;
const bench = SEED_EXERCISES.find((e) => e.name === 'Bench Press')!;

const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

beforeEach(async () => {
  setCurrentUserId('pr2-profile');
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.workouts.clear();
  await db.sets.clear();
  await db.personal_records.clear();
  await db.body_metrics.clear();
});

const liveRows = async (exerciseId: string, types?: string[]): Promise<PersonalRecord[]> =>
  (await db.personal_records.where('exercise_id').equals(exerciseId).toArray()).filter(
    (r) => r.deleted_at == null && (!types || types.includes(r.type)),
  );

/** Μία προπόνηση `daysAgo` μέρες πριν· επιστρέφει τα newPRs ΚΑΘΕ σετ (ό,τι γιορτάζει το UI). */
async function session(
  exerciseId: string,
  daysAgo: number,
  sets: Array<{ reps: number; weight?: number | null }>,
): Promise<{ workoutId: string; broken: PRType[][]; setIds: string[] }> {
  const w = await startWorkout('strength', day(daysAgo));
  const broken: PRType[][] = [];
  const setIds: string[] = [];
  for (const s of sets) {
    const res = await addSet({
      workout_id: w.id,
      exercise_id: exerciseId,
      weight_kg: s.weight ?? null,
      bodyweight_kg: null,
      reps: s.reps,
      hold_seconds: null,
    });
    broken.push(res.newPRs);
    setIds.push(res.id);
  }
  await endWorkout(w.id);
  return { workoutId: w.id, broken, setIds };
}

const sig = (rows: PersonalRecord[]) =>
  rows.map((r) => `${r.type}|${r.set_id}|${r.value}`).sort();

describe('max_reps / reps στο ίδιο φορτίο', () => {
  it('καθαρό σώμα: 20 → 30 έλξεις = PR (max_reps)· ισοπαλία 30 = όχι', async () => {
    await session(pull.id, 9, [{ reps: 20 }]);
    const up = await session(pull.id, 5, [{ reps: 30 }]);
    expect(up.broken[0]).toContain('max_reps');
    expect(up.broken[0]).not.toContain('reps_at_load'); // όχι διπλό για το ίδιο σετ
    const tie = await session(pull.id, 1, [{ reps: 30 }]);
    expect(tie.broken[0]).not.toContain('max_reps');
    expect(tie.broken[0]).not.toContain('reps_at_load');
    expect(realPRs(await liveRows(pull.id, ['max_reps'])).map((r) => r.value)).toEqual([30]);
  });

  it('ίδιο πρόσθετο φορτίο: +10 kg × 6 → × 8 = PR, παρότι το max_reps είναι 20', async () => {
    await session(pull.id, 9, [{ reps: 20 }, { reps: 6, weight: 10 }]);
    const up = await session(pull.id, 5, [{ reps: 8, weight: 10 }]);
    expect(up.broken[0]).toContain('reps_at_load');
    expect(up.broken[0]).not.toContain('max_reps');
    const rows = await liveRows(pull.id, ['reps_at_load']);
    expect(rows.map((r) => [r.value, r.weight_kg, r.workout_id])).toEqual([[8, 10, up.workoutId]]);
    expect(realPRs(rows)).toHaveLength(1); // μετρά χωρίς baseline row
  });

  it('ισοπαλία στο ίδιο φορτίο ΔΕΝ είναι PR', async () => {
    await session(pull.id, 9, [{ reps: 20 }, { reps: 8, weight: 10 }]);
    const tie = await session(pull.id, 5, [{ reps: 8, weight: 10 }]);
    expect(tie.broken[0]).not.toContain('reps_at_load');
    expect(await liveRows(pull.id, ['reps_at_load'])).toHaveLength(0);
  });

  it('και σε ασκήσεις με βάρη: πάγκος 100 kg × 5 → × 6 μετά από 60 × 12', async () => {
    await session(bench.id, 9, [{ reps: 12, weight: 60 }, { reps: 5, weight: 100 }]);
    const up = await session(bench.id, 5, [{ reps: 6, weight: 100 }]);
    expect(up.broken[0]).toContain('reps_at_load');
  });

  it('live = recompute (ίδια rows, ίδια ids) και διόρθωση προς τα κάτω σβήνει το ρεκόρ', async () => {
    await session(pull.id, 9, [{ reps: 20 }, { reps: 6, weight: 10 }]);
    const up = await session(pull.id, 5, [{ reps: 8, weight: 10 }]);
    const before = await liveRows(pull.id);
    await recomputePRsForExercise(pull.id);
    const after = await liveRows(pull.id);
    expect(sig(after)).toEqual(sig(before));
    const repsRow = (rows: PersonalRecord[]) => rows.find((r) => r.type === 'reps_at_load')!.id;
    expect(repsRow(after)).toBe(repsRow(before));

    await softDeleteSet(up.setIds[0]!);
    expect(await liveRows(pull.id, ['reps_at_load'])).toHaveLength(0);
  });
});

describe('reps-ισοδύναμο (μόνο ασκήσεις σώματος)', () => {
  it('40 kg × 1 (≈ 25) σπάει το 30 kg × 3 (≈ 21)', async () => {
    await session(pull.id, 9, [{ reps: 3, weight: 30 }]);
    await session(pull.id, 5, [{ reps: 1, weight: 40 }]);
    const real = realPRs(await liveRows(pull.id, ['rep_equivalent']));
    expect(real.map((r) => [r.value, r.weight_kg, r.reps])).toEqual([[25, 40, 1]]);
  });

  it('3 reps ≡ +5 kg: 4 σκέτες → +5 kg × 1 είναι ισοπαλία, όχι PR', async () => {
    await session(pull.id, 9, [{ reps: 4 }]);
    await session(pull.id, 5, [{ reps: 1, weight: 5 }]);
    expect(realPRs(await liveRows(pull.id, ['rep_equivalent']))).toHaveLength(0);
  });

  it('6 reps ≡ +10 kg: 7 σκέτες → +10 kg × 2 (≈ 8) είναι PR', async () => {
    await session(pull.id, 9, [{ reps: 7 }]);
    await session(pull.id, 5, [{ reps: 2, weight: 10 }]);
    expect(realPRs(await liveRows(pull.id, ['rep_equivalent'])).map((r) => r.value)).toEqual([8]);
  });

  it('άσκηση χωρίς σώμα (πάγκος) → κανένα reps-ισοδύναμο', async () => {
    await session(bench.id, 9, [{ reps: 3, weight: 30 }]);
    await session(bench.id, 5, [{ reps: 1, weight: 40 }]);
    await recomputePRsForExercise(bench.id);
    expect(await liveRows(bench.id, ['rep_equivalent'])).toHaveLength(0);
  });

  it('γιορτάζεται μόνο όταν το σετ δεν έσπασε τίποτα άλλο', async () => {
    await session(pull.id, 9, [{ reps: 10 }]);
    // 30 σκέτες: max_reps ΚΑΙ reps-ισοδύναμο — μετρά ως ΕΝΑ (όχι «2 PR»)
    const both = await session(pull.id, 5, [{ reps: 30 }]);
    expect(both.broken[0]).toContain('max_reps');
    expect(both.broken[0]).not.toContain('rep_equivalent');
    expect(await liveRows(pull.id, ['rep_equivalent'])).toHaveLength(2); // το row γράφτηκε
  });

  it('κανένα XP από τους νέους τύπους', async () => {
    await session(pull.id, 9, [{ reps: 20 }, { reps: 6, weight: 10 }, { reps: 3, weight: 30 }]);
    await session(pull.id, 5, [{ reps: 8, weight: 10 }, { reps: 1, weight: 40 }]);
    const all = await liveRows(pull.id);
    expect(realPRs(all).some((r) => r.type === 'reps_at_load')).toBe(true);
    expect(realPRs(all).some((r) => r.type === 'rep_equivalent')).toBe(true);
    const xpTypes = xpPRs(all, LATE_PR_TYPES).map((r) => r.type);
    expect(xpTypes).not.toContain('reps_at_load');
    expect(xpTypes).not.toContain('rep_equivalent');
  });
});
