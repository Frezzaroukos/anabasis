import { describe, expect, it } from 'vitest';
import { daysBetween, relativeDayLabel } from './relativeDay';

const t = (key: string, opts?: { count: number }) =>
  opts?.count != null ? `${key}:${opts.count}` : key;

describe('relativeDayLabel', () => {
  const now = new Date(2026, 10, 22, 15, 0, 0);

  it('μετράει τοπικές μέρες, όχι ώρες', () => {
    expect(daysBetween('2026-11-22T01:00:00', now)).toBe(0);
    expect(daysBetween('2026-11-21T23:00:00', now)).toBe(1);
  });

  it('σήμερα, χθες, μέσα στην εβδομάδα, μετά ημερομηνία', () => {
    expect(relativeDayLabel('2026-11-22T08:00:00', t, 'en-GB', now)).toBe('dashboard.relative.today');
    expect(relativeDayLabel('2026-11-21T08:00:00', t, 'en-GB', now)).toBe('dashboard.relative.yesterday');
    expect(relativeDayLabel('2026-11-19T08:00:00', t, 'en-GB', now)).toBe('dashboard.relative.daysAgo:3');
    expect(relativeDayLabel('2026-11-01T08:00:00', t, 'en-GB', now)).toMatch(/Nov/);
  });
});
