import { describe, expect, it } from 'vitest';
import {
  formatWeight,
  kgToLb,
  lbToKg,
  parseWeightToKg,
  toDisplayWeight,
} from './units';
import type { WeightUnit } from './db/types';

describe('kgToLb / lbToKg', () => {
  it('μετατρέπει σωστά και προς τις δύο κατευθύνσεις', () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 2);
    expect(lbToKg(220.462)).toBeCloseTo(100, 2);
  });

  it('kg→lb→kg κύκλος γυρίζει στο ίδιο νούμερο (ακριβής SI μετατροπή)', () => {
    expect(lbToKg(kgToLb(100))).toBeCloseTo(100, 9);
  });
});

describe('toDisplayWeight — στρογγυλοποίηση ανά granularity', () => {
  it('kg/plate: δεν αλλάζει ήδη-στρογγυλεμένη τιμή (βήμα 0.5)', () => {
    expect(toDisplayWeight(82.5, 'kg', 'plate')).toBe(82.5);
  });

  it('lb/plate: στρογγυλοποιεί σε plate-realistic βήμα 0.5 (όχι ψευδο-ακρίβεια)', () => {
    // 100kg → 220.46226lb → κοντινότερο 0.5 = 220.5
    expect(toDisplayWeight(100, 'lb', 'plate')).toBe(220.5);
    // 60kg → 132.277lb → 132.5
    expect(toDisplayWeight(60, 'lb', 'plate')).toBe(132.5);
  });

  it('body: στρογγυλοποιεί σε βήμα 0.1', () => {
    expect(toDisplayWeight(78.53, 'kg', 'body')).toBe(78.5);
    expect(toDisplayWeight(78.57, 'kg', 'body')).toBe(78.6);
  });

  it('default granularity είναι plate', () => {
    expect(toDisplayWeight(100, 'lb')).toBe(220.5);
  });
});

describe('formatWeight', () => {
  it('προσθέτει τη μονάδα by default', () => {
    expect(formatWeight(78.5, 'kg', { granularity: 'body' })).toBe('78.5 kg');
    expect(formatWeight(100, 'lb', { granularity: 'plate' })).toBe('220.5 lb');
  });

  it('withUnit:false → μόνο ο αριθμός, χωρίς μονάδα', () => {
    expect(formatWeight(80, 'kg', { withUnit: false })).toBe('80');
  });

  it('δεν προσθέτει ψεύτικα δεκαδικά σε ακέραιες τιμές', () => {
    expect(formatWeight(8000, 'kg')).toBe('8000 kg');
  });
});

describe('parseWeightToKg', () => {
  it('kg περνάει ουσιαστικά ως έχει', () => {
    expect(parseWeightToKg(82.5, 'kg')).toBe(82.5);
  });

  it('lb μετατρέπεται σε kg', () => {
    expect(parseWeightToKg(225, 'lb')).toBeCloseTo(102.06, 2);
  });
});

describe('round-trip: format→parse δεν «γλιστράει» παραπέρα σε κάθε κύκλο', () => {
  const cases: Array<{ kg: number; unit: WeightUnit; granularity: 'plate' | 'body' }> = [
    { kg: 100, unit: 'lb', granularity: 'plate' },
    { kg: 60, unit: 'lb', granularity: 'plate' },
    { kg: 20.412, unit: 'lb', granularity: 'plate' },
    { kg: 78.5, unit: 'lb', granularity: 'body' },
    { kg: 82.5, unit: 'kg', granularity: 'plate' },
    { kg: 78.53, unit: 'kg', granularity: 'body' },
  ];

  for (const { kg, unit, granularity } of cases) {
    it(`${kg}kg σε ${unit} (${granularity}) σταθεροποιείται μετά τον πρώτο κύκλο`, () => {
      const displayed = toDisplayWeight(kg, unit, granularity);
      const backToKg = parseWeightToKg(displayed, unit);
      const displayedAgain = toDisplayWeight(backToKg, unit, granularity);
      // Ο ΔΕΥΤΕΡΟΣ κύκλος format→parse→format δίνει ΤΟ ΙΔΙΟ αποτέλεσμα με τον
      // πρώτο — η στρογγυλοποίηση σταθεροποιείται, δεν συσσωρεύει σφάλμα.
      expect(displayedAgain).toBe(displayed);

      // Κι ένας τρίτος κύκλος για σιγουριά.
      const backToKg2 = parseWeightToKg(displayedAgain, unit);
      const displayedThirdTime = toDisplayWeight(backToKg2, unit, granularity);
      expect(displayedThirdTime).toBe(displayed);
    });
  }
});
