import { describe, expect, it } from 'vitest';
import { dotSizeOf, weekAdherenceTint } from './calendarMath';
import type { DayActivities } from '@/lib/db/queries';

type WorkoutEntry = DayActivities['workouts'][number];

function workout(overrides: Partial<WorkoutEntry> = {}): WorkoutEntry {
  return {
    id: 'w1',
    kind: 'strength',
    label: null,
    durationSeconds: null,
    distanceKm: null,
    sets: 0,
    ...overrides,
  };
}

describe('dotSizeOf', () => {
  it('set-logged: λίγα σετ → sm', () => {
    expect(dotSizeOf(workout({ sets: 3 }))).toBe('sm');
  });

  it('set-logged: μεσαία δόση → md', () => {
    expect(dotSizeOf(workout({ sets: 6 }))).toBe('md');
    expect(dotSizeOf(workout({ sets: 14 }))).toBe('md');
  });

  it('set-logged: βαριά συνεδρία → lg', () => {
    expect(dotSizeOf(workout({ sets: 15 }))).toBe('lg');
    expect(dotSizeOf(workout({ sets: 30 }))).toBe('lg');
  });

  it('χωρίς σετ (run/bike/…): κρίνεται από διάρκεια, όχι sets=0', () => {
    expect(dotSizeOf(workout({ sets: 0, durationSeconds: 5 * 60 }))).toBe('sm');
    expect(dotSizeOf(workout({ sets: 0, durationSeconds: 20 * 60 }))).toBe('md');
    expect(dotSizeOf(workout({ sets: 0, durationSeconds: 60 * 60 }))).toBe('lg');
  });

  it('χωρίς σετ ΚΑΙ χωρίς διάρκεια → sm (ασφαλές default)', () => {
    expect(dotSizeOf(workout({ sets: 0, durationSeconds: null }))).toBe('sm');
  });
});

describe('weekAdherenceTint', () => {
  const cal = new Map<string, DayActivities>([
    ['2026-01-01', { date: '2026-01-01', workouts: [workout()], weight: null }],
    ['2026-01-03', { date: '2026-01-03', workouts: [workout()], weight: null }],
    ['2026-01-05', { date: '2026-01-05', workouts: [workout()], weight: null }],
  ]);

  it('καμία μέρα προπόνησης → χωρίς tint', () => {
    const week = ['2026-02-01', '2026-02-02', null, null, null, null, null];
    expect(weekAdherenceTint(week, cal)).toBe('');
  });

  it('όλα κενά κελιά (padding μήνα) → χωρίς tint', () => {
    expect(weekAdherenceTint([null, null, null, null, null, null, null], cal)).toBe('');
  });

  it('1 μέρα στις 7 (~14%) → ελαφρύ tint', () => {
    const week = ['2026-01-01', '2026-01-02', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10'];
    expect(weekAdherenceTint(week, cal)).toBe('bg-primary/5');
  });

  it('3 μέρες στις 7 (~43%) → μεσαίο tint', () => {
    const week = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07'];
    expect(weekAdherenceTint(week, cal)).toBe('bg-primary/10');
  });

  it('5+ μέρες → έντονο tint', () => {
    const heavyCal = new Map<string, DayActivities>(
      ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05'].map((d) => [
        d,
        { date: d, workouts: [workout()], weight: null },
      ]),
    );
    const week = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07'];
    expect(weekAdherenceTint(week, heavyCal)).toBe('bg-primary/15');
  });
});
