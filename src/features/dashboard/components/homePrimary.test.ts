import { describe, expect, it } from 'vitest';
import { homePrimaryAction } from './homePrimary';

const upper = { id: 's1', title: 'Upper', status: 'planned' };

describe('homePrimaryAction', () => {
  it('μένει loading όσο λείπει το active ή το πρόγραμμα της μέρας', () => {
    expect(homePrimaryAction(undefined, [])).toEqual({ kind: 'loading' });
    expect(homePrimaryAction(null, undefined)).toEqual({ kind: 'loading' });
  });

  it('με ενεργή προπόνηση είναι συνέχεια, ακόμα κι αν υπάρχει πρόγραμμα', () => {
    expect(homePrimaryAction({ id: 'w1' }, [upper])).toEqual({ kind: 'continue' });
  });

  it('χωρίς ενεργή, ξεκινά την πρώτη προγραμματισμένη', () => {
    expect(
      homePrimaryAction(null, [
        { id: 'done', title: 'Old', status: 'done' },
        upper,
      ]),
    ).toEqual({ kind: 'scheduled', sessionId: 's1', title: 'Upper' });
  });

  it('χωρίς τίποτα ανοιχτό ή προγραμματισμένο είναι απλή έναρξη', () => {
    expect(homePrimaryAction(null, [])).toEqual({ kind: 'start' });
  });
});
