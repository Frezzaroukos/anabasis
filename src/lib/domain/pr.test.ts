import { describe, expect, it } from 'vitest';
import { candidatesFromSet, isNewPR } from './pr';
import type { SetEntry } from '../db/types';

/**
 * Τα PR είναι η μόνη περιοχή όπου ένα σιωπηλό λάθος διαβρώνει την εμπιστοσύνη:
 * ένα ψεύτικο ρεκόρ είναι χειρότερο από κανένα ρεκόρ.
 */
const baseSet = (over: Partial<SetEntry> = {}): SetEntry => ({
  id: 's1',
  workout_id: 'w1',
  exercise_id: 'e1',
  set_number: 1,
  weight_kg: 100,
  bodyweight_kg: null,
  reps: 5,
  hold_seconds: null,
  rpe: null,
  is_warmup: false,
  is_failure: false,
  notes: null,
  rest_seconds: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
  ...over,
});

describe('candidatesFromSet', () => {
  it('βγάζει υποψηφιότητες για weighted σετ (βάρος + reps)', () => {
    const c = candidatesFromSet(baseSet());
    const types = c.map((x) => x.type);
    expect(types).toContain('max_weight');
    expect(types).toContain('max_reps');
    expect(c.find((x) => x.type === 'max_weight')?.value).toBe(100);
    expect(c.find((x) => x.type === 'max_reps')?.value).toBe(5);
  });

  it('βγάζει max_hold για isometric σετ (hold χωρίς reps)', () => {
    const c = candidatesFromSet(
      baseSet({ weight_kg: null, reps: null, hold_seconds: 12 }),
    );
    expect(c.map((x) => x.type)).toContain('max_hold');
    expect(c.find((x) => x.type === 'max_hold')?.value).toBe(12);
  });

  it('δεν βγάζει υποψηφιότητες από κενό σετ', () => {
    const c = candidatesFromSet(
      baseSet({ weight_kg: null, reps: null, hold_seconds: null }),
    );
    expect(c).toHaveLength(0);
  });
});

describe('isNewPR', () => {
  const cand = { type: 'max_weight' as const, value: 100, reps: 5, weight_kg: 100 };

  it('χωρίς προηγούμενο ρεκόρ → πάντα νέο', () => {
    expect(isNewPR(cand, null)).toBe(true);
  });

  it('μεγαλύτερη τιμή → νέο ρεκόρ', () => {
    expect(isNewPR(cand, { type: 'max_weight', value: 95 })).toBe(true);
  });

  it('ίδια τιμή → ΟΧΙ νέο (αποφεύγει διπλά ρεκόρ)', () => {
    expect(isNewPR(cand, { type: 'max_weight', value: 100 })).toBe(false);
  });

  it('μικρότερη τιμή → ΟΧΙ νέο', () => {
    expect(isNewPR(cand, { type: 'max_weight', value: 120 })).toBe(false);
  });

  it('συγκρίνει μόνο ίδιου τύπου ρεκόρ', () => {
    expect(isNewPR(cand, { type: 'max_reps', value: 999 })).toBe(true);
  });
});
