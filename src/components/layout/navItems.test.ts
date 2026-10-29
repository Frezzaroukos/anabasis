import { describe, expect, it } from 'vitest';
import { PRIMARY_NAV, SECONDARY_NAV } from './navItems';

describe('navItems', () => {
  it('βάζει την Κοινότητα στα κύρια tabs και τις Ασκήσεις στο «Περισσότερα»', () => {
    const primary = PRIMARY_NAV.map((item) => item.to);
    const secondary = SECONDARY_NAV.map((item) => item.to);

    expect(primary).toContain('/community');
    expect(primary).not.toContain('/exercises');
    expect(secondary).toContain('/exercises');
  });

  it('δεν έχει διπλούς προορισμούς', () => {
    const all = [...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => item.to);
    expect(new Set(all).size).toBe(all.length);
  });
});
