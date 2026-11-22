import { describe, expect, it } from 'vitest';
import { compactNumber } from './format';

describe('compactNumber', () => {
  it('δεν στρογγυλοποιεί μικρές τιμές σε 0k', () => {
    expect(compactNumber(400)).toBe('400');
    expect(compactNumber(0)).toBe('0');
  });
  it('χιλιάδες με ένα δεκαδικό, δεκάδες χιλιάδων χωρίς', () => {
    expect(compactNumber(1250)).toBe('1.3k');
    expect(compactNumber(12_400)).toBe('12k');
  });
});
