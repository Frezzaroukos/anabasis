import { describe, expect, it } from 'vitest';
import { formatDisplayWeight, parseDisplayWeight, stepDisplayWeight, weightStep } from './weightEntry';

describe('weightEntry', () => {
  it('βήμα 0.1 kg και 0.5 lb', () => {
    expect(weightStep('kg')).toBe(0.1);
    expect(weightStep('lb')).toBe(0.5);
  });

  it('ανεβάζει και κατεβάζει σε kg χωρίς float σκουπίδια', () => {
    expect(stepDisplayWeight('80.4', 1, 'kg')).toBe('80.5');
    expect(stepDisplayWeight('80.5', -1, 'kg')).toBe('80.4');
  });

  it('lb πάει ανά μισή λίβρα και δεν πέφτει κάτω από το 0', () => {
    expect(stepDisplayWeight('180', 1, 'lb')).toBe('180.5');
    expect(stepDisplayWeight('0.1', -1, 'kg')).toBe('0');
    expect(stepDisplayWeight('', 1, 'kg')).toBe('0.1');
  });

  it('δέχεται κόμμα και απορρίπτει κενό', () => {
    expect(parseDisplayWeight('78,4')).toBe(78.4);
    expect(parseDisplayWeight('')).toBeNull();
    expect(parseDisplayWeight('abc')).toBeNull();
  });

  it('μορφώνει αποθηκευμένα kg στη μονάδα οθόνης', () => {
    expect(formatDisplayWeight(80.4, 'kg')).toBe('80.4');
    expect(formatDisplayWeight(80, 'lb')).toBe('176.4');
  });
});
