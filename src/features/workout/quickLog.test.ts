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

describe('parseQuickSets — drop sets, multi-weight, 4xmax, half reps', () => {
  it('«30kg 5+4+3(drop set 10kg 7)» → συνδέει το τελευταίο σετ με το drop set', () => {
    expect(parseQuickSets('30kg 5+4+3(drop set 10kg 7)', true)).toEqual([
      { weightKg: 30, reps: 5 },
      { weightKg: 30, reps: 4 },
      { weightKg: 30, reps: 3, dropGroup: 1 },
      { weightKg: 10, reps: 7, setType: 'dropset', dropGroup: 1 },
    ]);
  });

  it('«26kg 2,5+1(drop set 18kg 10)16kg 10» → μισή επανάληψη + drop set + επόμενο σετ', () => {
    expect(parseQuickSets('26kg 2,5+1(drop set 18kg 10)16kg 10', true)).toEqual([
      { weightKg: 26, reps: 2.5 },
      { weightKg: 26, reps: 1, dropGroup: 1 },
      { weightKg: 18, reps: 10, setType: 'dropset', dropGroup: 1 },
      { weightKg: 16, reps: 10 },
    ]);
  });

  it('«80kg 1 + 90kg 1 + 100kg 1 + 80kg 6» → πολλαπλά βάρη σε μία γραμμή', () => {
    expect(parseQuickSets('80kg 1 + 90kg 1 + 100kg 1 + 80kg 6', true)).toEqual([
      { weightKg: 80, reps: 1 },
      { weightKg: 90, reps: 1 },
      { weightKg: 100, reps: 1 },
      { weightKg: 80, reps: 6 },
    ]);
  });

  it('«60kg 9+ 70kg 8(50kg 9)» → πολλαπλά βάρη + σύντομο παρενθετικό drop set', () => {
    expect(parseQuickSets('60kg 9+ 70kg 8(50kg 9)', true)).toEqual([
      { weightKg: 60, reps: 9 },
      { weightKg: 70, reps: 8, dropGroup: 1 },
      { weightKg: 50, reps: 9, setType: 'dropset', dropGroup: 1 },
    ]);
  });

  it('«18kg 4xmax» → 4 AMRAP σετ στα 18kg', () => {
    expect(parseQuickSets('18kg 4xmax', true)).toEqual([
      { weightKg: 18, reps: null, setType: 'amrap', notes: 'max' },
      { weightKg: 18, reps: null, setType: 'amrap', notes: 'max' },
      { weightKg: 18, reps: null, setType: 'amrap', notes: 'max' },
      { weightKg: 18, reps: null, setType: 'amrap', notes: 'max' },
    ]);
  });

  it('«80kg 3x5» → 3 σετ των 5 επαναλήψεων', () => {
    expect(parseQuickSets('80kg 3x5', true)).toEqual([
      { weightKg: 80, reps: 5 },
      { weightKg: 80, reps: 5 },
      { weightKg: 80, reps: 5 },
    ]);
  });

  it('«bw 2+1+1+1» σε weighted mode → 4 pure bodyweight σετ', () => {
    expect(parseQuickSets('bw 2+1+1+1', true)).toEqual([
      { weightKg: null, reps: 2 },
      { weightKg: null, reps: 1 },
      { weightKg: null, reps: 1 },
      { weightKg: null, reps: 1 },
    ]);
  });
});
