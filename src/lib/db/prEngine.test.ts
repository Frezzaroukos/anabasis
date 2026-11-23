import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './index';
import { SEED_EXERCISES } from './seeds';
import { setCurrentUserId } from './session';
import {
  addSet,
  endWorkout,
  recomputePRsForExercise,
  saveBodyMetric,
  softDeleteSet,
  softDeleteWorkout,
  startWorkout,
} from './queries';
import { realPRs, xpPRs } from '../domain/prBaseline';
import { LATE_PR_TYPES } from '../domain/pr';
import type { PersonalRecord } from './types';

/**
 * PR engine: σωματικό βάρος ως μεταβλητή (total load / relative strength),
 * κατά προσέγγιση βάρος, και ρεκόρ ΣΥΝΕΔΡΙΑΣ ανά άσκηση.
 */
const pull = SEED_EXERCISES.find((e) => e.name === 'Pull-ups')!;
const lsit = SEED_EXERCISES.find((e) => e.name === 'L-Sit')!;

const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

beforeEach(async () => {
  setCurrentUserId('pr-engine-profile');
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

async function session(
  exerciseId: string,
  daysAgo: number,
  sets: Array<{ reps?: number; hold?: number; weight?: number | null; warmup?: boolean }>,
) {
  const w = await startWorkout('strength', day(daysAgo));
  for (const s of sets) {
    await addSet({
      workout_id: w.id,
      exercise_id: exerciseId,
      weight_kg: s.weight ?? null,
      bodyweight_kg: null,
      reps: s.reps ?? null,
      hold_seconds: s.hold ?? null,
      is_warmup: s.warmup ?? false,
    });
  }
  const sessionPRs = await endWorkout(w.id);
  return { w, sessionPRs };
}

describe('σωματικό βάρος ως μεταβλητή', () => {
  it('ίδια απόδοση με μεγαλύτερο σωματικό βάρος = PR συνολικού φορτίου, ΟΧΙ σχετικής δύναμης', async () => {
    await saveBodyMetric(day(30), { weight_kg: 80 });
    await saveBodyMetric(day(4), { weight_kg: 82 });
    await session(pull.id, 10, [{ reps: 8, weight: 10 }]); // bw 80
    await session(pull.id, 2, [{ reps: 8, weight: 10 }]); // bw 82

    const total = await liveRows(pull.id, ['max_total_load']);
    expect(total.map((r) => r.value).sort()).toEqual([90, 92]);
    const newest = total.find((r) => r.value === 92)!;
    expect(newest.bodyweight_kg).toBe(82);
    expect(realPRs(total).map((r) => r.value)).toEqual([92]); // η πρώτη = baseline
    // σχετική δύναμη: (82+10)/82 < (80+10)/80 → ΔΕΝ είναι ρεκόρ
    const rel = await liveRows(pull.id, ['relative_strength']);
    expect(rel).toHaveLength(1);
    expect(rel[0]!.bodyweight_kg).toBe(80);
  });

  it('end-to-end: αλλαγή μέτρησης Body ανάμεσα σε 2 προπονήσεις + recompute = σταθερό (idempotent)', async () => {
    await saveBodyMetric(day(30), { weight_kg: 80 });
    await session(pull.id, 10, [{ reps: 8 }]);
    await saveBodyMetric(day(4), { weight_kg: 82 });
    await session(pull.id, 2, [{ reps: 8 }]);
    const before = (await liveRows(pull.id)).map((r) => `${r.id}|${r.type}|${r.value}`).sort();
    await recomputePRsForExercise(pull.id);
    await recomputePRsForExercise(pull.id);
    const after = (await liveRows(pull.id)).map((r) => `${r.id}|${r.type}|${r.value}`).sort();
    expect(after).toEqual(before);
    expect((await liveRows(pull.id, ['max_total_load'])).map((r) => r.value).sort()).toEqual([80, 82]);
  });

  it('λιγότερο σωματικό βάρος: δεν σπάει total load· σχετική δύναμη μετρά μόνο με ≥1% κέρδος', async () => {
    await saveBodyMetric(day(60), { weight_kg: 80 });
    await saveBodyMetric(day(8), { weight_kg: 78 }); // +0.3% στον λόγο → θόρυβος
    await saveBodyMetric(day(3), { weight_kg: 72 }); // ~+1.2% → ρεκόρ
    await session(pull.id, 20, [{ reps: 8, weight: 10 }]);
    await session(pull.id, 6, [{ reps: 8, weight: 10 }]);
    await session(pull.id, 1, [{ reps: 8, weight: 10 }]);

    expect((await liveRows(pull.id, ['max_total_load'])).map((r) => r.value)).toEqual([90]);
    const rel = await liveRows(pull.id, ['relative_strength']);
    expect(rel.map((r) => r.bodyweight_kg).sort()).toEqual([72, 80]);
  });

  it('fallback: ΜΟΝΟ μεταγενέστερη μέτρηση ≤60 ημέρες → «κατά προσέγγιση», το σετ μένει χωρίς βάρος', async () => {
    await saveBodyMetric(day(3), { weight_kg: 82 });
    const { w } = await session(pull.id, 20, [{ reps: 8 }]); // 17 μέρες πριν τη μέτρηση
    await session(pull.id, 120, [{ reps: 8 }]); // 117 μέρες → εκτός παραθύρου
    const sets = await db.sets.where('workout_id').equals(w.id).toArray();
    expect(sets[0]!.bodyweight_kg).toBeNull(); // τίποτα δεν γράφεται σιωπηλά
    await recomputePRsForExercise(pull.id);
    const total = await liveRows(pull.id, ['max_total_load', 'e1rm_total']);
    expect(total.length).toBe(2);
    for (const r of total) {
      expect(r.bw_estimated).toBe(true);
      expect(r.bodyweight_kg).toBe(82);
    }
    // ποτέ σχετική δύναμη πάνω σε εκτίμηση
    expect(await liveRows(pull.id, ['relative_strength'])).toHaveLength(0);
  });

  it('χωρίς καμία μέτρηση: κανένα συνολικό φορτίο (δεν επινοείται βάρος)', async () => {
    await session(pull.id, 5, [{ reps: 8 }]);
    await recomputePRsForExercise(pull.id);
    expect(await liveRows(pull.id, ['max_total_load', 'e1rm_total', 'relative_strength'])).toHaveLength(0);
  });
});

describe('ρεκόρ συνεδρίας ανά άσκηση', () => {
  const types = ['session_sets', 'session_reps', 'session_volume', 'session_hold'];

  it('η πρώτη προπόνηση = baseline (δεν επιστρέφεται), περισσότερα σετ = πραγματικό ρεκόρ, ισοπαλία ≠ ρεκόρ', async () => {
    const first = await session(pull.id, 10, [{ reps: 8 }, { reps: 8 }, { reps: 8 }]);
    expect(first.sessionPRs).toEqual([]);
    expect((await liveRows(pull.id, types)).length).toBeGreaterThan(0); // baseline rows υπάρχουν

    const second = await session(pull.id, 5, [{ reps: 8 }, { reps: 8 }, { reps: 8 }, { reps: 8 }]);
    expect(second.sessionPRs.map((r) => r.type).sort()).toEqual(['session_reps', 'session_sets']);
    const sets = second.sessionPRs.find((r) => r.type === 'session_sets')!;
    expect(sets.value).toBe(4);
    expect(sets.set_id).toBeNull();
    expect(sets.workout_id).toBe(second.w.id);

    const tie = await session(pull.id, 2, [{ reps: 8 }, { reps: 8 }, { reps: 8 }, { reps: 8 }]);
    expect(tie.sessionPRs).toEqual([]);
  });

  it('warm-up δεν μετρά· κενό σετ δεν μετρά', async () => {
    await session(pull.id, 10, [{ reps: 8 }, { reps: 8 }]);
    const r = await session(pull.id, 5, [{ reps: 8 }, { reps: 8 }, { reps: 20, warmup: true }, { reps: 20, warmup: true }, {}]);
    expect(r.sessionPRs).toEqual([]);
  });

  it('hold: σύνολο δευτερολέπτων', async () => {
    await session(lsit.id, 10, [{ hold: 10 }, { hold: 10 }, { hold: 10 }]);
    const r = await session(lsit.id, 4, [{ hold: 10 }, { hold: 10 }, { hold: 10 }, { hold: 10 }]);
    const hold = r.sessionPRs.find((x) => x.type === 'session_hold')!;
    expect(hold.value).toBe(40);
  });

  it('όγκος με συνολικό φορτίο όταν γνωστό', async () => {
    await saveBodyMetric(day(30), { weight_kg: 80 });
    await session(pull.id, 10, [{ reps: 5 }]); // 80×5 = 400
    const r = await session(pull.id, 3, [{ reps: 5, weight: 10 }]); // 90×5 = 450
    expect(r.sessionPRs.find((x) => x.type === 'session_volume')!.value).toBe(450);
  });

  it('προπόνηση σε εξέλιξη δεν δημιουργεί ρεκόρ συνεδρίας· το live addSet δεν γιορτάζει session τύπους', async () => {
    await session(pull.id, 10, [{ reps: 8 }]);
    const live = await startWorkout('strength', day(1));
    let celebrated: string[] = [];
    for (let i = 0; i < 4; i++) {
      const s = await addSet({ workout_id: live.id, exercise_id: pull.id, weight_kg: null, bodyweight_kg: null, reps: 8, hold_seconds: null });
      celebrated = celebrated.concat(s.newPRs);
    }
    expect(celebrated.some((t) => t.startsWith('session_'))).toBe(false);
    const rows = await liveRows(pull.id, types);
    expect(rows.every((r) => r.workout_id !== live.id)).toBe(true);
    // μετά τη λήξη εμφανίζεται
    const done = await endWorkout(live.id);
    expect(done.map((r) => r.type)).toContain('session_sets');
  });

  it('σβήσιμο σετ / προπόνησης → recompute με tombstones (sync-safe)', async () => {
    await session(pull.id, 10, [{ reps: 8 }, { reps: 8 }]);
    const second = await session(pull.id, 5, [{ reps: 8 }, { reps: 8 }, { reps: 8 }]);
    expect((await liveRows(pull.id, ['session_sets'])).map((r) => r.value).sort()).toEqual([2, 3]);

    const sets = await db.sets.where('workout_id').equals(second.w.id).toArray();
    await softDeleteSet(sets[0]!.id); // 3 → 2 σετ· δεν ξεπερνά πια το baseline
    expect((await liveRows(pull.id, ['session_sets'])).map((r) => r.value)).toEqual([2]);
    const tomb = (await db.personal_records.where('exercise_id').equals(pull.id).toArray()).filter(
      (r) => r.type === 'session_sets' && r.deleted_at != null,
    );
    expect(tomb.length).toBeGreaterThan(0);

    await softDeleteWorkout(second.w.id);
    expect(realPRs(await liveRows(pull.id, types))).toEqual([]);
  });

  it('δεν δίνουν XP και δεν επηρεάζουν τα set-level ρεκόρ', async () => {
    await session(pull.id, 10, [{ reps: 8 }]);
    await session(pull.id, 5, [{ reps: 8 }, { reps: 8 }]);
    const all = await liveRows(pull.id);
    expect(realPRs(all).some((r) => r.type === 'session_sets')).toBe(true);
    expect(xpPRs(all, LATE_PR_TYPES).some((r) => r.type.startsWith('session_'))).toBe(false);
    // set-level: μένουν max_reps/max_volume κ.λπ. από το πρώτο σετ
    expect(all.some((r) => r.type === 'max_reps')).toBe(true);
  });
});

describe('previewSessionPRs (διάλογος λήξης)', () => {
  it('προβλέπει ό,τι θα επιστρέψει το endWorkout, χωρίς να γράφει τίποτα', async () => {
    const { previewSessionPRs } = await import('./queries');
    await session(pull.id, 10, [{ reps: 8 }, { reps: 8 }]);
    const live = await startWorkout('strength', day(1));
    for (let i = 0; i < 3; i++) {
      await addSet({ workout_id: live.id, exercise_id: pull.id, weight_kg: null, bodyweight_kg: null, reps: 8, hold_seconds: null });
    }
    const before = (await db.personal_records.toArray()).length;
    const preview = await previewSessionPRs(live.id);
    expect((await db.personal_records.toArray()).length).toBe(before); // καμία εγγραφή
    const done = await endWorkout(live.id);
    expect(preview.map((r) => `${r.type}:${r.value}`).sort()).toEqual(done.map((r) => `${r.type}:${r.value}`).sort());
    expect(preview.length).toBeGreaterThan(0);
  });

  it('πρώτη προπόνηση: η προεπισκόπηση είναι κενή (baseline)', async () => {
    const { previewSessionPRs } = await import('./queries');
    const live = await startWorkout('strength', day(1));
    await addSet({ workout_id: live.id, exercise_id: pull.id, weight_kg: null, bodyweight_kg: null, reps: 8, hold_seconds: null });
    expect(await previewSessionPRs(live.id)).toEqual([]);
  });
});
