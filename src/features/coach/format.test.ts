import { describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import { formatMove, formatDeloadReason } from './format';

/**
 * Stub TFunction: επιστρέφει «key|json(params)» ώστε να ελέγχουμε ΠΟΙΟ i18n key
 * και ΠΟΙΑ interpolation values περνάει ο formatter — χωρίς πραγματικό i18next.
 */
const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}|${JSON.stringify(params)}` : key) as unknown as TFunction;

// common.sec → «s» για προβλέψιμο assert στο hold.
const tHold = ((key: string, params?: Record<string, unknown>) => {
  if (key === 'common.sec') return 's';
  return params ? `${key}|${JSON.stringify(params)}` : key;
}) as unknown as TFunction;

const fmtKg = (kg: number) => `${kg}kg`;

describe('formatMove', () => {
  it('add_weight → key + increment/weight μορφοποιημένα σε μονάδα', () => {
    const out = formatMove({ kind: 'add_weight', weightKg: 22.5, incrementKg: 2.5 }, t, fmtKg);
    expect(out).toBe('settings.coach.hint.addWeight|{"increment":"2.5kg","weight":"22.5kg"}');
  });

  it('add_rep → key + reps', () => {
    const out = formatMove({ kind: 'add_rep', reps: 9 }, t, fmtKg);
    expect(out).toBe('settings.coach.hint.addRep|{"reps":9}');
  });

  it('add_hold → key + delta/target + localized sec', () => {
    const out = formatMove({ kind: 'add_hold', targetSeconds: 30, deltaSeconds: 5 }, tHold, fmtKg);
    expect(out).toBe('settings.coach.hint.addHold|{"delta":5,"target":30,"sec":"s"}');
  });

  it('skill_step → key + step/max', () => {
    const out = formatMove({ kind: 'skill_step', step: 4, max: 5 }, t, fmtKg);
    expect(out).toBe('settings.coach.hint.skillStep|{"step":4,"max":5}');
  });

  it('δεν καλεί fmtWeight για μη-weight κινήσεις', () => {
    const spy = vi.fn((kg: number) => `${kg}kg`);
    formatMove({ kind: 'add_rep', reps: 9 }, t, spy);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('formatDeloadReason', () => {
  it('volume → volumeWarning με percent/rpe', () => {
    const out = formatDeloadReason({ code: 'volume', percent: 40, rpe: 8.5 }, t);
    expect(out).toBe('settings.coach.deload.volumeWarning|{"percent":40,"rpe":8.5}');
  });

  it('consecutive → consecutiveDays με days', () => {
    const out = formatDeloadReason({ code: 'consecutive', days: 6 }, t);
    expect(out).toBe('settings.coach.deload.consecutiveDays|{"days":6}');
  });
});
