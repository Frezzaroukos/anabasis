import { describe, expect, it } from 'vitest';
import { isBaselinePR, realPRs } from './prBaseline';

const row = (
  workout_id: string,
  type: string,
  achieved_at: string,
  exercise_id: string | null = 'e1',
  deleted_at: string | null = null,
  activity_kind: string | null = null,
) => ({ exercise_id, activity_kind, type, workout_id, achieved_at, deleted_at }) as never;

describe('realPRs', () => {
  it('a first-ever workout produces no PRs (all baseline rows, even chained inside the workout)', () => {
    const rows = [
      row('w1', 'max_weight', '2026-11-01T10:00:00Z'),
      row('w1', 'max_weight', '2026-11-01T10:05:00Z'), // 2ο σετ, βαρύτερο — ίδια προπόνηση
      row('w1', 'max_reps', '2026-11-01T10:00:00Z'),
    ];
    expect(realPRs(rows)).toEqual([]);
  });

  it('counts a row that beat a record from an earlier workout', () => {
    const base = row('w1', 'max_weight', '2026-11-01T10:00:00Z');
    const broke = row('w2', 'max_weight', '2026-11-08T10:00:00Z');
    expect(realPRs([base, broke])).toEqual([broke]);
    expect(isBaselinePR(base, [base, broke])).toBe(true);
    expect(isBaselinePR(broke, [base, broke])).toBe(false);
  });

  it('the first workout stays baseline even after later workouts exist (history detail of workout 1)', () => {
    const w1 = row('w1', 'max_weight', '2026-11-01T10:00:00Z');
    const w2 = row('w2', 'max_weight', '2026-11-08T10:00:00Z');
    expect(realPRs([w1, w2]).includes(w1)).toBe(false);
  });

  it('is per exercise+type: a brand new type or exercise is not a broken record', () => {
    const rows = [
      row('w1', 'max_weight', '2026-11-01T10:00:00Z'),
      row('w2', 'est_1rm', '2026-11-08T10:00:00Z'), // νέος τύπος
      row('w2', 'max_weight', '2026-11-08T10:00:00Z', 'e2'), // νέα άσκηση
    ];
    expect(realPRs(rows)).toEqual([]);
  });

  it('ignores tombstones (a deleted earlier record does not make the next one a PR)', () => {
    const dead = row('w1', 'max_weight', '2026-11-01T10:00:00Z', 'e1', '2026-11-02T00:00:00Z');
    const next = row('w2', 'max_weight', '2026-11-08T10:00:00Z');
    expect(realPRs([dead, next])).toEqual([]);
  });

  it('works for activity PRs (no exercise) grouped by activity kind', () => {
    const a = row('w1', 'longest_distance', '2026-11-01T10:00:00Z', null, null, 'run');
    const b = row('w2', 'longest_distance', '2026-11-08T10:00:00Z', null, null, 'run');
    const other = row('w3', 'longest_distance', '2026-11-09T10:00:00Z', null, null, 'cycling');
    expect(realPRs([a, b, other])).toEqual([b]);
  });

  it('keeps the input order', () => {
    const w1 = row('w1', 'max_weight', '2026-11-01T10:00:00Z');
    const w2 = row('w2', 'max_weight', '2026-11-08T10:00:00Z');
    const w3 = row('w3', 'max_weight', '2026-11-15T10:00:00Z');
    expect(realPRs([w3, w1, w2])).toEqual([w3, w2]);
  });
});
