import { describe, expect, it } from 'vitest';
import { CHART_RANGE_DAYS, tickFormatterFor, tickIntervalFor } from './timeRange';

/**
 * Καθαρές συναρτήσεις που οδηγούν το domain + tick density των Progress
 * charts (ARCHITECTURE-V4 §7 W-D) — testable χωρίς rendering.
 */
describe('CHART_RANGE_DAYS', () => {
  it('κάθε επιλογή έχει αύξουσα σειρά μέρες, 1M ο πιο κοντινός ορίζοντας', () => {
    expect(CHART_RANGE_DAYS['1M']).toBeLessThan(CHART_RANGE_DAYS['3M']);
    expect(CHART_RANGE_DAYS['3M']).toBeLessThan(CHART_RANGE_DAYS['6M']);
    expect(CHART_RANGE_DAYS['6M']).toBeLessThan(CHART_RANGE_DAYS['1Y']);
    expect(CHART_RANGE_DAYS['1Y']).toBeLessThan(CHART_RANGE_DAYS.ALL);
  });
});

describe('tickIntervalFor', () => {
  it('δεν προσπερνά ticks όταν τα σημεία χωράνε ήδη', () => {
    expect(tickIntervalFor('1M', 4)).toBe(0);
  });

  it('αραιώνει τα ticks όσο μεγαλώνει το εύρος δεδομένων', () => {
    const oneMonth = tickIntervalFor('1M', 30);
    const oneYear = tickIntervalFor('1Y', 365);
    expect(oneYear).toBeGreaterThan(oneMonth);
  });
});

describe('tickFormatterFor', () => {
  it('κοντινά εύρη (1M/3M): μέρα/μήνας', () => {
    expect(tickFormatterFor('1M')('2026-08-20')).toBe('08-20');
    expect(tickFormatterFor('3M')('2026-08-20')).toBe('08-20');
  });

  it('μακρινά εύρη (6M/1Y/All): μήνας/έτος, όχι ολόκληρη ημερομηνία', () => {
    const label = tickFormatterFor('1Y')('2026-08-20');
    expect(label).not.toBe('08-20');
    expect(label.length).toBeGreaterThan(0);
  });
});
