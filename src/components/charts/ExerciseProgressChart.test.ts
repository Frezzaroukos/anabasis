import { describe, expect, it } from 'vitest';
import { prTypeFor } from './ExerciseProgressChart';

/**
 * Στις ασκήσεις σωματικού βάρους το chart δείχνει συνολικό φορτίο
 * (σωματικό + πρόσθετο) για topWeight/e1rm → η γραμμή PR πρέπει να είναι το
 * συνολικό ρεκόρ, όχι το πρόσθετο (αλλιώς άλλη κλίμακα).
 */
describe('prTypeFor', () => {
  it('bodyweight: topWeight/e1rm → συνολικά ρεκόρ', () => {
    expect(prTypeFor('topWeight', true)).toBe('max_total_load');
    expect(prTypeFor('e1rm', true)).toBe('e1rm_total');
  });

  it('volume/reps και μη-bodyweight → τα κανονικά ρεκόρ', () => {
    expect(prTypeFor('volume', true)).toBe('max_volume');
    expect(prTypeFor('reps', true)).toBe('max_reps');
    expect(prTypeFor('topWeight', false)).toBe('max_weight');
    expect(prTypeFor('e1rm', false)).toBe('e1rm');
  });
});

import { METRIC_OPTIONS, resolveMetrics } from './ExerciseProgressChart';
import { localNoon } from './timeRange';

describe('resolveMetrics', () => {
  const all = ['topWeight', 'e1rm', 'reps', 'volume', 'hold'] as const;
  it('άσκηση hold-only: κρατά μόνο hold και το κάνει ενεργό', () => {
    const r = resolveMetrics([...all], 'topWeight', [
      { topWeight: null, e1rm: null, maxReps: null, volume: 0, hold: 25 },
    ]);
    expect(r.tabs).toEqual(['hold']);
    expect(r.active).toBe('hold');
  });
  it('bodyweight χωρίς καταγεγραμμένο βάρος: reps δουλεύει (maxReps), όχι topWeight', () => {
    const r = resolveMetrics([...all], 'topWeight', [
      { topWeight: null, e1rm: null, maxReps: 20, volume: 0, hold: null },
    ]);
    expect(r.tabs).toEqual(['reps']);
    expect(r.active).toBe('reps');
  });
  it('χωρίς δεδομένα: όλα τα tabs εκτός hold, ίδιο metric', () => {
    const r = resolveMetrics([...all], 'e1rm', []);
    expect(r.tabs).not.toContain('hold');
    expect(r.active).toBe('e1rm');
  });
  it('το reps διαβάζει maxReps, το hold έχει κατάληξη s', () => {
    expect(METRIC_OPTIONS.reps.field).toBe('maxReps');
    expect(METRIC_OPTIONS.hold.suffix).toBe('s');
  });
});

describe('localNoon', () => {
  it('YYYY-MM-DD → ίδια τοπική μέρα (όχι UTC shift)', () => {
    const d = localNoon('2026-11-22');
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 11, 22]);
  });
});
