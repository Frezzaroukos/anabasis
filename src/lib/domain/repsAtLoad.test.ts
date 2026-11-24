import { describe, expect, it } from 'vitest';
import { candidatesFromSet, isNewPR, loadKey, RepsAtLoadTracker } from './pr';

const s = (workout_id: string, reps: number | null, weight_kg: number | null = null) => ({
  workout_id,
  reps,
  weight_kg,
});

describe('max_reps — καθαρό σώμα', () => {
  it('20 → 30 σκέτες έλξεις = PR· ισοπαλία 30 = όχι', () => {
    const maxReps = (reps: number) =>
      candidatesFromSet({ ...s('w', reps), id: 'x' } as never).find((c) => c.type === 'max_reps')!;
    expect(isNewPR(maxReps(30), { type: 'max_reps', value: 20 })).toBe(true);
    expect(isNewPR(maxReps(30), { type: 'max_reps', value: 30 })).toBe(false);
  });
});

describe('RepsAtLoadTracker — περισσότερες reps με ίδιο φορτίο', () => {
  it('+10 kg × 6 → × 8 είναι PR ακόμα κι αν το max_reps (20 σκέτες) δεν σπάει', () => {
    const t = new RepsAtLoadTracker();
    expect(t.consider(s('w1', 20))).toBeNull();
    expect(t.consider(s('w1', 6, 10))).toBeNull();
    const pr = t.consider(s('w2', 8, 10));
    expect(pr).toEqual({ type: 'reps_at_load', value: 8, reps: 8, weight_kg: 10 });
  });

  it('ισοπαλία στο ίδιο φορτίο ΔΕΝ είναι PR', () => {
    const t = new RepsAtLoadTracker();
    t.consider(s('w1', 20));
    t.consider(s('w1', 8, 10));
    expect(t.consider(s('w2', 8, 10))).toBeNull();
  });

  it('το καλύτερο ανεβαίνει: μετά το × 8, ένα × 7 δεν μετρά, ένα × 9 μετρά', () => {
    const t = new RepsAtLoadTracker();
    t.consider(s('w1', 20));
    t.consider(s('w1', 6, 10));
    expect(t.consider(s('w2', 8, 10))).not.toBeNull();
    expect(t.consider(s('w3', 7, 10))).toBeNull();
    expect(t.consider(s('w3', 9, 10))?.value).toBe(9);
  });

  it('νέο φορτίο δεν είναι ρεκόρ reps (δεν ξεπέρασες τίποτα)', () => {
    const t = new RepsAtLoadTracker();
    t.consider(s('w1', 20));
    expect(t.consider(s('w2', 5, 15))).toBeNull();
  });

  it('μέσα στην ΙΔΙΑ προπόνηση δεν «σπάει» το δικό της πρώτο σετ', () => {
    const t = new RepsAtLoadTracker();
    t.consider(s('w1', 20));
    t.consider(s('w1', 5, 10));
    expect(t.consider(s('w1', 6, 10))).toBeNull();
  });

  it('όταν σπάει και το συνολικό max_reps, δεν διπλογράφεται (το πιάνει το max_reps)', () => {
    const t = new RepsAtLoadTracker();
    t.consider(s('w1', 20));
    expect(t.consider(s('w2', 30))).toBeNull(); // 20 → 30 σκέτες = max_reps
  });

  it('σκέτο σώμα: null και 0 kg είναι το ίδιο φορτίο', () => {
    const t = new RepsAtLoadTracker();
    t.consider(s('w1', 12, 20)); // βαρύ σετ με περισσότερες reps
    t.consider(s('w1', 10, null));
    expect(t.consider(s('w2', 11, 0))?.type).toBe('reps_at_load');
  });

  it('hold χωρίς reps αγνοείται', () => {
    const t = new RepsAtLoadTracker();
    expect(t.consider(s('w1', null, 10))).toBeNull();
  });

  it('loadKey: lb που έγιναν kg καταλήγουν στο ίδιο κλειδί', () => {
    expect(loadKey(null)).toBe(0);
    expect(loadKey(0)).toBe(0);
    expect(loadKey(20.411656)).toBe(loadKey(20.4116));
  });
});
