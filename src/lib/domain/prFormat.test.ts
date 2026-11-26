import { describe, expect, it } from 'vitest';
import { formatPRValue, prBodyChange, signedWeight } from './prFormat';

describe('formatPRValue', () => {
  it('βάρος, hold, σχετική δύναμη, καθαρός αριθμός', () => {
    expect(formatPRValue({ type: 'max_total_load', value: 92 }, 'kg')).toBe('92 kg');
    expect(formatPRValue({ type: 'session_volume', value: 450 }, 'kg')).toBe('450 kg');
    expect(formatPRValue({ type: 'session_hold', value: 40 }, 'kg')).toBe('40s');
    expect(formatPRValue({ type: 'relative_strength', value: 1.4263 }, 'kg')).toBe('×1.43');
    expect(formatPRValue({ type: 'session_sets', value: 4 }, 'kg')).toBe('4');
  });

  it('reps-ισοδύναμο: σκορ «≈ 25», ποτέ βάρος (ούτε σε lb)', () => {
    expect(formatPRValue({ type: 'rep_equivalent', value: 25 }, 'kg')).toBe('≈ 25');
    expect(formatPRValue({ type: 'rep_equivalent', value: 9.5 }, 'lb')).toBe('≈ 9.5');
    expect(formatPRValue({ type: 'rep_equivalent', value: 25 }, 'kg')).not.toMatch(/kg|lb/);
  });

  it('reps στο ίδιο φορτίο: «φορτίο × reps», σκέτο σώμα μόνο reps', () => {
    expect(formatPRValue({ type: 'reps_at_load', value: 8, weight_kg: 10 }, 'kg')).toBe('10 kg × 8');
    expect(formatPRValue({ type: 'reps_at_load', value: 8, weight_kg: 20.411656 }, 'lb')).toBe('45 lb × 8');
    expect(formatPRValue({ type: 'reps_at_load', value: 31, weight_kg: null }, 'kg')).toBe('31');
  });
});

describe('prBodyChange', () => {
  const pr = { type: 'max_total_load', value: 92, bodyweight_kg: 82, bw_estimated: false };
  it('δείχνει και τις δύο αλλαγές όταν το σώμα άλλαξε', () => {
    expect(prBodyChange(pr, { value: 90, bodyweight_kg: 80 })).toEqual({
      valueDeltaKg: 2,
      bodyDeltaKg: 2,
      estimated: false,
    });
  });
  it('null όταν το σώμα δεν άλλαξε, λείπει προηγούμενο ή άλλος τύπος', () => {
    expect(prBodyChange(pr, { value: 90, bodyweight_kg: 82 })).toBeNull();
    expect(prBodyChange(pr, null)).toBeNull();
    expect(prBodyChange(pr, { value: 90, bodyweight_kg: null })).toBeNull();
    expect(prBodyChange({ ...pr, type: 'max_reps' }, { value: 1, bodyweight_kg: 80 })).toBeNull();
  });
  it('σημαίνει estimated', () => {
    expect(prBodyChange({ ...pr, bw_estimated: true }, { value: 90, bodyweight_kg: 80 })!.estimated).toBe(true);
  });
});

describe('signedWeight', () => {
  it('πρόσημο και μονάδα', () => {
    expect(signedWeight(2, 'kg')).toBe('+2 kg');
    expect(signedWeight(-1.5, 'kg')).toBe('−1.5 kg');
  });
});
