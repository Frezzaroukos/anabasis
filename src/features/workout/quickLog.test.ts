import { describe, expect, it } from 'vitest';
import { parseQuickSets } from './quickLog';

describe('parseQuickSets — γρήγορη καταγραφή όπως στο Notion', () => {
  it('«80 5,4,3,2» → 4 σετ 80kg', () => {
    expect(parseQuickSets('80 5,4,3,2', true)).toEqual([
      { weightKg: 80, reps: 5 },
      { weightKg: 80, reps: 4 },
      { weightKg: 80, reps: 3 },
      { weightKg: 80, reps: 2 },
    ]);
  });

  it('«80 5+4+3» — το «+» όπως το γράφει ο χρήστης', () => {
    expect(parseQuickSets('80 5+4+3', true)).toEqual([
      { weightKg: 80, reps: 5 },
      { weightKg: 80, reps: 4 },
      { weightKg: 80, reps: 3 },
    ]);
  });

  it('«80kg 5 4 3» — με μονάδα και κενά', () => {
    expect(parseQuickSets('80kg 5 4 3', true)).toEqual([
      { weightKg: 80, reps: 5 },
      { weightKg: 80, reps: 4 },
      { weightKg: 80, reps: 3 },
    ]);
  });

  it('«80x5» → ένα σετ', () => {
    expect(parseQuickSets('80x5', true)).toEqual([{ weightKg: 80, reps: 5 }]);
  });

  it('«84,4 5» → 84.4kg δεκαδικό (κόμμα βάρους)', () => {
    expect(parseQuickSets('84,4 5', true)).toEqual([{ weightKg: 84.4, reps: 5 }]);
  });

  it('«84,4» μόνο του σε weighted mode → άκυρο (δεκαδικό βάρος χωρίς reps, ΟΧΙ 2 ψευδο-σετ)', () => {
    expect(parseQuickSets('84,4', true)).toEqual([]);
  });

  it('«84,4» σε bodyweight mode → κανονική λίστα reps (84, 4) αφού δεν υπάρχει ασάφεια βάρους', () => {
    expect(parseQuickSets('84,4', false)).toEqual([
      { weightKg: null, reps: 84 },
      { weightKg: null, reps: 4 },
    ]);
  });

  it('bodyweight «5,4,3» → reps χωρίς βάρος', () => {
    expect(parseQuickSets('5,4,3', false)).toEqual([
      { weightKg: null, reps: 5 },
      { weightKg: null, reps: 4 },
      { weightKg: null, reps: 3 },
    ]);
  });

  it('κενό input → κανένα σετ', () => {
    expect(parseQuickSets('', true)).toEqual([]);
    expect(parseQuickSets('   ', true)).toEqual([]);
  });

  it('μόνο βάρος χωρίς reps → άκυρο', () => {
    expect(parseQuickSets('80', true)).toEqual([]);
  });

  it('αγνοεί μη-αριθμητικά σκουπίδια', () => {
    expect(parseQuickSets('80 5 fail 4', true)).toEqual([
      { weightKg: 80, reps: 5 },
      { weightKg: 80, reps: 4 },
    ]);
  });
});

describe('parseQuickSets — μονάδα lb (ο χρήστης γράφει στη ΔΙΚΗ ΤΟΥ μονάδα)', () => {
  it('«225 5,4,3» σε lb mode → weightKg μετατρεμμένο σε kg (αποθήκευση πάντα σε kg)', () => {
    const result = parseQuickSets('225 5,4,3', true, 'lb');
    expect(result).toHaveLength(3);
    expect(result[0]!.weightKg).toBeCloseTo(102.06, 2);
    expect(result.every((s) => s.weightKg === result[0]!.weightKg)).toBe(true);
  });

  it('χωρίς unit param → default kg (οπισθο-συμβατό)', () => {
    expect(parseQuickSets('80 5', true)).toEqual([{ weightKg: 80, reps: 5 }]);
  });

  it('bodyweight mode: η μονάδα δεν παίζει ρόλο, weightKg μένει null', () => {
    expect(parseQuickSets('5,4,3', false, 'lb')).toEqual([
      { weightKg: null, reps: 5 },
      { weightKg: null, reps: 4 },
      { weightKg: null, reps: 3 },
    ]);
  });
});
