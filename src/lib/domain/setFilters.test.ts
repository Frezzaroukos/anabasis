import { describe, expect, it } from 'vitest';
import { isWorkingSet, isWarmupOrDeleted } from './setFilters';

/**
 * Ένας ορισμός για «working set». Αν κάποιος χαλαρώσει τον κανόνα εδώ, όλες
 * οι μετρήσεις (όγκοι/PR/XP) που στηρίζονται πάνω του αλλάζουν μαζί — γι' αυτό
 * τα δύο σημάδια (is_warmup ΚΑΙ set_type) ελέγχονται ανεξάρτητα.
 */
describe('isWorkingSet', () => {
  it('true μόνο όταν δεν είναι warm-up με κανένα σημάδι και δεν είναι deleted', () => {
    expect(isWorkingSet({ is_warmup: false, set_type: 'normal', deleted_at: null })).toBe(true);
  });

  it('false όταν is_warmup σημασμένο ακόμα κι αν set_type δεν είναι warmup', () => {
    expect(isWorkingSet({ is_warmup: true, set_type: 'normal', deleted_at: null })).toBe(false);
  });

  it('false όταν set_type === warmup ακόμα κι αν is_warmup false (παλιά/χειροκίνητα δεδομένα)', () => {
    expect(isWorkingSet({ is_warmup: false, set_type: 'warmup', deleted_at: null })).toBe(false);
  });

  it('false όταν είναι soft-deleted ανεξαρτήτως τύπου', () => {
    expect(isWorkingSet({ is_warmup: false, set_type: 'normal', deleted_at: '2026-01-01T00:00:00.000Z' })).toBe(false);
  });

  it('isWarmupOrDeleted είναι το ακριβές αντίστροφο', () => {
    const cases = [
      { is_warmup: false, set_type: 'normal', deleted_at: null },
      { is_warmup: true, set_type: 'normal', deleted_at: null },
      { is_warmup: false, set_type: 'warmup', deleted_at: null },
      { is_warmup: false, set_type: 'dropset', deleted_at: 'x' },
    ] as const;
    for (const c of cases) {
      expect(isWarmupOrDeleted(c)).toBe(!isWorkingSet(c));
    }
  });
});
