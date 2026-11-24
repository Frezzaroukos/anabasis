import { describe, expect, it } from 'vitest';
import { REP_EQUIVALENT_REPS_PER_KG, repEquivalentScore } from './repEquivalent';
import { candidatesFromSet, isNewPR } from './pr';
import type { SetEntry } from '../db/types';

/** Κανόνας χρήστη: «ανά 3 reps 1–3 μονές με +5 kg· ανά 6 reps με +10 kg». */
describe('repEquivalentScore', () => {
  it('ο συντελεστής είναι +5 kg ≈ 3 reps, σε ένα σημείο', () => {
    expect(REP_EQUIVALENT_REPS_PER_KG).toBe(0.6);
    expect(5 * REP_EQUIVALENT_REPS_PER_KG).toBe(3);
  });

  it('3 reps = +5 kg × 1 και 6 reps = +10 kg × 1 (ισοδυναμία)', () => {
    // 1 μονή με +5 ≈ 1 + 3 reps σκέτο σώμα
    expect(repEquivalentScore(1, 5)).toBe(repEquivalentScore(4, 0));
    expect(repEquivalentScore(1, 10)).toBe(repEquivalentScore(7, 0));
    // για κάθε n: n+3 σκέτες ≡ n με +5, n+6 σκέτες ≡ n με +10
    for (const n of [1, 2, 3, 8, 15]) {
      expect(repEquivalentScore(n, 5)).toBe(repEquivalentScore(n + 3, 0));
      expect(repEquivalentScore(n, 10)).toBe(repEquivalentScore(n + 6, 0));
    }
  });

  it('40 kg × 1 (≈ 25) νικά 30 kg × 3 (≈ 21)', () => {
    expect(repEquivalentScore(1, 40)).toBe(25);
    expect(repEquivalentScore(3, 30)).toBe(21);
  });

  it('σταθερή τιμή χωρίς floating θόρυβο', () => {
    expect(repEquivalentScore(5, 7.5)).toBe(9.5);
    expect(repEquivalentScore(3, 1.25)).toBe(3.75);
  });

  it('χωρίς reps → 0· χωρίς/αρνητικό πρόσθετο → σκέτες reps', () => {
    expect(repEquivalentScore(null, 20)).toBe(0);
    expect(repEquivalentScore(0, 20)).toBe(0);
    expect(repEquivalentScore(12, null)).toBe(12);
    expect(repEquivalentScore(12, 0)).toBe(12);
    expect(repEquivalentScore(12, -5)).toBe(12);
  });
});

function set(partial: Partial<SetEntry>): SetEntry {
  return {
    id: 's',
    workout_id: 'w',
    exercise_id: 'e',
    set_number: 1,
    weight_kg: null,
    bodyweight_kg: null,
    reps: null,
    rest_pause_reps: [],
    hold_seconds: null,
    rpe: null,
    rir: null,
    tempo: null,
    is_warmup: false,
    is_failure: false,
    set_type: 'normal',
    group_id: null,
    notes: null,
    rest_seconds: null,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    deleted_at: null,
    ...partial,
  };
}

const repEq = (s: SetEntry, bodyweightExercise: boolean) =>
  candidatesFromSet(s, { bodyweightExercise }).find((c) => c.type === 'rep_equivalent');

describe('rep_equivalent PR candidate', () => {
  it('μόνο σε ασκήσεις σώματος — χωρίς άσκηση σώματος κανένα', () => {
    expect(repEq(set({ reps: 3, weight_kg: 30 }), true)?.value).toBe(21);
    expect(repEq(set({ reps: 3, weight_kg: 30 }), false)).toBeUndefined();
    expect(repEq(set({ reps: 3, weight_kg: 30 }), undefined as unknown as boolean)).toBeUndefined();
  });

  it('hold χωρίς reps δεν δίνει reps-ισοδύναμο', () => {
    expect(repEq(set({ hold_seconds: 30 }), true)).toBeUndefined();
  });

  it('ισοπαλία ΔΕΝ είναι PR· +5 kg × 2 μετά από 4 σκέτες είναι', () => {
    const current = { type: 'rep_equivalent', value: repEquivalentScore(4, 0) };
    expect(isNewPR(repEq(set({ reps: 1, weight_kg: 5 }), true)!, current)).toBe(false);
    expect(isNewPR(repEq(set({ reps: 2, weight_kg: 5 }), true)!, current)).toBe(true);
  });

  it('40 kg × 1 σπάει το 30 kg × 3 — το αντίστροφο όχι', () => {
    const heavy = repEq(set({ reps: 1, weight_kg: 40 }), true)!;
    const lighter = repEq(set({ reps: 3, weight_kg: 30 }), true)!;
    expect(isNewPR(heavy, { type: 'rep_equivalent', value: lighter.value })).toBe(true);
    expect(isNewPR(lighter, { type: 'rep_equivalent', value: heavy.value })).toBe(false);
  });
});
