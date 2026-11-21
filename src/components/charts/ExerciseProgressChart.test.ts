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
