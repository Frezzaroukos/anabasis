import { describe, expect, it } from 'vitest';
import { initialLanguage } from './index';

describe('initialLanguage', () => {
  it('προτιμά το sa.lang όταν είναι en ή el', () => {
    expect(initialLanguage('el', 'en-US')).toBe('el');
    expect(initialLanguage('en', 'el-GR')).toBe('en');
  });

  it('αλλιώς διαβάζει τον browser και πέφτει στα αγγλικά', () => {
    expect(initialLanguage(null, 'el-GR')).toBe('el');
    expect(initialLanguage('fr', 'fr-FR')).toBe('en');
    expect(initialLanguage(null, 'en-US')).toBe('en');
  });
});
