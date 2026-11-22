import { describe, expect, it } from 'vitest';
import { prLineApplies } from './ExerciseProgressChart';

/**
 * Στις ασκήσεις σωματικού βάρους το chart δείχνει συνολικό φορτίο
 * (σωματικό + πρόσθετο) για topWeight/e1rm, αλλά το PR είναι μόνο το
 * πρόσθετο. Η γραμμή PR εκεί θα ήταν σε άλλη κλίμακα → την κρύβουμε.
 */
describe('prLineApplies', () => {
  it('κρύβει τη γραμμή PR για topWeight/e1rm σε bodyweight άσκηση', () => {
    expect(prLineApplies('topWeight', true)).toBe(false);
    expect(prLineApplies('e1rm', true)).toBe(false);
  });

  it('την κρατά για volume/reps (συμβατή βάση) και για μη-bodyweight', () => {
    expect(prLineApplies('volume', true)).toBe(true);
    expect(prLineApplies('reps', true)).toBe(true);
    expect(prLineApplies('topWeight', false)).toBe(true);
    expect(prLineApplies('e1rm', false)).toBe(true);
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
