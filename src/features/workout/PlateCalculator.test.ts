import { describe, expect, it } from 'vitest';
import {
  calculatePlates,
  DEFAULT_BAR_LB,
  STANDARD_PLATES_LB,
} from './components/PlateCalculator';

describe('calculatePlates', () => {
  it('100kg στόχος, 20kg μπάρα → 40kg ανά πλευρά = 25 + 15', () => {
    const result = calculatePlates(100, 20);
    expect(result.perSide).toBe(40);
    expect(result.plates).toEqual([
      { plate: 25, count: 1 },
      { plate: 15, count: 1 },
    ]);
    expect(result.remainder).toBe(0);
  });

  it('60kg στόχος, 20kg μπάρα → 20kg ανά πλευρά = 20', () => {
    const result = calculatePlates(60, 20);
    expect(result.perSide).toBe(20);
    expect(result.plates).toEqual([{ plate: 20, count: 1 }]);
    expect(result.remainder).toBe(0);
  });

  it('στόχος ίσος ή μικρότερος από τη μπάρα → κενή στοίβα', () => {
    expect(calculatePlates(20, 20)).toEqual({ perSide: 0, plates: [], remainder: 0 });
    expect(calculatePlates(10, 20)).toEqual({ perSide: 0, plates: [], remainder: 0 });
  });

  it('συνδυάζει πολλά ίδια δισκάκια όταν χρειάζεται', () => {
    const result = calculatePlates(140, 20); // 60kg ανά πλευρά = 25+25+10
    expect(result.perSide).toBe(60);
    expect(result.plates).toEqual([
      { plate: 25, count: 2 },
      { plate: 10, count: 1 },
    ]);
  });

  it('στόχος που δεν διαιρείται ακριβώς αφήνει remainder', () => {
    const result = calculatePlates(61, 20); // 20.5kg ανά πλευρά
    expect(result.perSide).toBe(20.5);
    expect(result.plates).toEqual([{ plate: 20, count: 1 }]);
    expect(result.remainder).toBe(0.5);
  });

  it('δέχεται custom λίστα διαθέσιμων δισκαριών', () => {
    const result = calculatePlates(50, 20, [10, 5]);
    expect(result.perSide).toBe(15);
    expect(result.plates).toEqual([{ plate: 10, count: 1 }, { plate: 5, count: 1 }]);
  });
});

describe('calculatePlates — lb σετ (45/35/25/10/5/2.5, μπάρα 45lb)', () => {
  it('225lb στόχος, 45lb μπάρα → 90lb ανά πλευρά = 45+45', () => {
    const result = calculatePlates(225, DEFAULT_BAR_LB, STANDARD_PLATES_LB);
    expect(result.perSide).toBe(90);
    expect(result.plates).toEqual([{ plate: 45, count: 2 }]);
    expect(result.remainder).toBe(0);
  });

  it('185lb στόχος, 45lb μπάρα → 70lb ανά πλευρά = 45+25', () => {
    const result = calculatePlates(185, DEFAULT_BAR_LB, STANDARD_PLATES_LB);
    expect(result.perSide).toBe(70);
    expect(result.plates).toEqual([
      { plate: 45, count: 1 },
      { plate: 25, count: 1 },
    ]);
  });

  it('135lb στόχος, 45lb μπάρα → 45lb ανά πλευρά = 45 (κλασικό «135»)', () => {
    const result = calculatePlates(135, DEFAULT_BAR_LB, STANDARD_PLATES_LB);
    expect(result.plates).toEqual([{ plate: 45, count: 1 }]);
    expect(result.remainder).toBe(0);
  });
});
