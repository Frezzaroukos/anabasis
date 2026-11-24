import { describe, expect, it } from 'vitest';
import { recentPRFeed, RECENT_PR_DAYS } from './prFeed';
import type { PersonalRecord } from '../db/types';

const NOW = new Date('2026-11-24T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

let seq = 0;
function pr(p: Partial<PersonalRecord> & Pick<PersonalRecord, 'type' | 'value' | 'workout_id' | 'achieved_at'>): PersonalRecord {
  seq += 1;
  return {
    id: `pr-${seq}`,
    user_id: 'u',
    exercise_id: 'pull',
    activity_kind: null,
    reps: null,
    weight_kg: null,
    set_id: `set-${seq}`,
    created_at: p.achieved_at,
    updated_at: p.achieved_at,
    deleted_at: null,
    ...p,
  };
}

/** baseline (παλιά προπόνηση) ώστε τα επόμενα rows του ίδιου τύπου να είναι πραγματικά PR */
const base = (type: string, exercise_id = 'pull') =>
  pr({ type, value: 1, workout_id: `base-${type}-${exercise_id}`, achieved_at: daysAgo(200), exercise_id });

describe('recentPRFeed', () => {
  it('μόνο τελευταίες 30 ημέρες', () => {
    expect(RECENT_PR_DAYS).toBe(30);
    const rows = [
      base('max_reps'),
      pr({ type: 'max_reps', value: 25, workout_id: 'old', achieved_at: daysAgo(31) }),
      pr({ type: 'max_reps', value: 26, workout_id: 'new', achieved_at: daysAgo(29) }),
    ];
    expect(recentPRFeed(rows, NOW).map((r) => r.value)).toEqual([26]);
    // 2 μέρες αργότερα το ρεκόρ των 29 ημερών γίνεται 31 → εκτός
    expect(recentPRFeed(rows, new Date(NOW.getTime() + 2 * 86_400_000))).toHaveLength(0);
  });

  it('το πολύ ΕΝΑ ανά άσκηση+τύπο: το καλύτερο, όχι το πιο πρόσφατο', () => {
    const rows = [
      base('max_reps'),
      base('max_weight'),
      pr({ type: 'max_reps', value: 22, workout_id: 'a', achieved_at: daysAgo(10) }),
      pr({ type: 'max_reps', value: 24, workout_id: 'b', achieved_at: daysAgo(6) }),
      pr({ type: 'max_reps', value: 23, workout_id: 'c', achieved_at: daysAgo(1) }), // backfill/edit: χαμηλότερο, πιο νέο
      pr({ type: 'max_weight', value: 20, workout_id: 'b', achieved_at: daysAgo(6) }),
    ];
    const feed = recentPRFeed(rows, NOW);
    expect(feed.filter((r) => r.type === 'max_reps').map((r) => r.value)).toEqual([24]);
    expect(feed.filter((r) => r.type === 'max_weight')).toHaveLength(1);
    expect(feed).toHaveLength(2);
  });

  it('διαφορετικές ασκήσεις μένουν χωριστά· ταξινόμηση από το πιο πρόσφατο', () => {
    const rows = [
      base('max_reps'),
      base('max_reps', 'dips'),
      pr({ type: 'max_reps', value: 22, workout_id: 'a', achieved_at: daysAgo(10) }),
      pr({ type: 'max_reps', value: 15, workout_id: 'b', achieved_at: daysAgo(2), exercise_id: 'dips' }),
    ];
    expect(recentPRFeed(rows, NOW).map((r) => r.exercise_id)).toEqual(['dips', 'pull']);
  });

  it('baseline (πρώτη φορά ποτέ) δεν εμφανίζεται ακόμα κι αν είναι πρόσφατο', () => {
    const rows = [pr({ type: 'max_reps', value: 10, workout_id: 'first', achieved_at: daysAgo(3) })];
    expect(recentPRFeed(rows, NOW)).toHaveLength(0);
  });

  it('ρυθμός: μικρότερο = καλύτερο', () => {
    const rows = [
      pr({ type: 'fastest_pace', value: 400, workout_id: 'r0', achieved_at: daysAgo(90), exercise_id: null, activity_kind: 'run' }),
      pr({ type: 'fastest_pace', value: 330, workout_id: 'r1', achieved_at: daysAgo(9), exercise_id: null, activity_kind: 'run' }),
      pr({ type: 'fastest_pace', value: 345, workout_id: 'r2', achieved_at: daysAgo(4), exercise_id: null, activity_kind: 'run' }),
    ];
    expect(recentPRFeed(rows, NOW).map((r) => r.value)).toEqual([330]);
  });

  it('reps στο ίδιο φορτίο: το βαρύτερο φορτίο είναι «το καλύτερο»', () => {
    const rows = [
      pr({ type: 'reps_at_load', value: 12, weight_kg: 5, workout_id: 'a', achieved_at: daysAgo(3) }),
      pr({ type: 'reps_at_load', value: 8, weight_kg: 10, workout_id: 'b', achieved_at: daysAgo(5) }),
    ];
    // improvement-only τύπος: μετρά χωρίς baseline row
    expect(recentPRFeed(rows, NOW).map((r) => r.weight_kg)).toEqual([10]);
  });

  it('reps-ισοδύναμο κρύβεται όταν το ΙΔΙΟ σετ φαίνεται ήδη με άλλο ρεκόρ', () => {
    const rows = [
      base('max_reps'),
      base('rep_equivalent'),
      pr({ type: 'max_reps', value: 30, workout_id: 'w', set_id: 'S', achieved_at: daysAgo(2) }),
      pr({ type: 'rep_equivalent', value: 30, workout_id: 'w', set_id: 'S', achieved_at: daysAgo(2) }),
      pr({ type: 'rep_equivalent', value: 25, workout_id: 'v', set_id: 'T', achieved_at: daysAgo(8) }),
    ];
    const feed = recentPRFeed(rows, NOW);
    expect(feed.map((r) => r.type)).toEqual(['max_reps']);
  });

  it('reps-ισοδύναμο μόνο του (π.χ. 40 kg × 1 μετά από 30 kg × 3) φαίνεται', () => {
    const rows = [
      base('rep_equivalent'),
      pr({ type: 'rep_equivalent', value: 25, reps: 1, weight_kg: 40, workout_id: 'w', set_id: 'S', achieved_at: daysAgo(2) }),
    ];
    expect(recentPRFeed(rows, NOW).map((r) => r.value)).toEqual([25]);
  });

  it('limit και soft-deleted', () => {
    const rows = [
      base('max_reps'),
      base('max_weight'),
      base('e1rm'),
      pr({ type: 'max_reps', value: 22, workout_id: 'a', achieved_at: daysAgo(3) }),
      pr({ type: 'max_weight', value: 20, workout_id: 'a', achieved_at: daysAgo(3) }),
      pr({ type: 'e1rm', value: 30, workout_id: 'a', achieved_at: daysAgo(3), deleted_at: daysAgo(1) }),
    ];
    expect(recentPRFeed(rows, NOW)).toHaveLength(2);
    expect(recentPRFeed(rows, NOW, { limit: 1 })).toHaveLength(1);
  });
});
