import { describe, expect, it } from 'vitest';
import type { SetEntry } from '@/lib/db/types';
import { summarizeWorkout } from './summary';

const set = (over: Partial<SetEntry>): SetEntry =>
  ({
    id: Math.random().toString(),
    workout_id: 'w',
    exercise_id: 'e1',
    weight_kg: 100,
    bodyweight_kg: null,
    reps: 5,
    rest_pause_reps: [],
    is_warmup: false,
    set_type: 'normal',
    deleted_at: null,
    ...over,
  }) as SetEntry;

describe('summarizeWorkout', () => {
  it('counts working sets, exercises and volume — warm-ups and deleted sets excluded', () => {
    const s = summarizeWorkout(
      [
        set({}),
        set({ reps: 3, weight_kg: 110 }),
        set({ exercise_id: 'e2', weight_kg: null, bodyweight_kg: 80, reps: 10 }),
        set({ is_warmup: true, set_type: 'warmup', weight_kg: 20 }),
        set({ deleted_at: '2026-11-22T00:00:00Z' }),
      ],
      [],
      'w',
    );
    expect(s.exercises).toBe(2);
    expect(s.sets).toBe(3);
    expect(s.volumeKg).toBe(500 + 330 + 800);
    expect(s.prs).toBe(0);
  });

  it('counts a PR only when it beat an earlier workout; first-ever baseline is not a PR', () => {
    const row = (exercise_id: string, type: string, workout_id: string, deleted_at: string | null = null) =>
      ({ exercise_id, type, workout_id, deleted_at }) as never;
    const s = summarizeWorkout(
      [],
      [
        // e1: παλιό ρεκόρ (w0) ξεπεράστηκε σήμερα σε 2 τύπους + διπλή γραμμή → 2 PRs
        row('e1', 'max_weight', 'w0'),
        row('e1', 'max_weight', 'w'),
        row('e1', 'max_weight', 'w'),
        row('e1', 'max_reps', 'w0'),
        row('e1', 'max_reps', 'w'),
        // e2: πρώτη φορά (μόνο σημερινή γραμμή) → όχι PR
        row('e2', 'max_weight', 'w'),
        // e3: ρεκόρ που σβήστηκε (tombstone) δεν μετρά
        row('e3', 'max_weight', 'w0', '2026-11-22T00:00:00Z'),
        row('e3', 'max_weight', 'w'),
      ],
      'w',
    );
    expect(s.prs).toBe(2);
  });
});
