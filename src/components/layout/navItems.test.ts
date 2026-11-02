import { describe, expect, it } from 'vitest';
import { PRIMARY_NAV, SECONDARY_NAV } from './navItems';

describe('navItems', () => {
  it('βάζει Home, Calendar, Goals, Programs στα κύρια tabs και τα υπόλοιπα στο «Περισσότερα»', () => {
    const primary = PRIMARY_NAV.map((item) => item.to);
    const secondary = SECONDARY_NAV.map((item) => item.to);

    expect(primary).toEqual(['/', '/calendar', '/goals', '/programs']);
    expect(secondary).toContain('/progress');
    expect(secondary).toContain('/community');
    expect(secondary).toContain('/exercises');
  });

  it('δεν έχει διπλούς προορισμούς', () => {
    const all = [...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => item.to);
    expect(new Set(all).size).toBe(all.length);
  });
});
