import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import { setCurrentUserId } from '@/lib/db/session';
import { parseWorkoutNotes } from './parseWorkoutNotes';
import { forgetPasteMatch, loadPasteMemory, rememberPasteMatch } from './pasteMemory';

// Node 26+: δικό του global localStorage σκιάζει του jsdom — in-memory polyfill.
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
  configurable: true,
});

beforeEach(() => {
  store.clear();
  setCurrentUserId('paste-memory-a');
});

const row = SEED_EXERCISES.find((e) => e.name === 'Inverted Rows')!;

describe('pasteMemory', () => {
  it('remembers a correction and the parser prefers it next time', () => {
    const before = parseWorkoutNotes('Rows machine: 40kg 8,8', SEED_EXERCISES, 'kg');
    expect(before[0]!.matchedExerciseId).not.toBe(row.id);

    expect(rememberPasteMatch('Rows machine', row.id)).toBe(true);
    const after = parseWorkoutNotes('rows MACHINE: 40kg 8,8', SEED_EXERCISES, 'kg', loadPasteMemory());
    expect(after[0]!.matchedExerciseId).toBe(row.id);
    expect(after[0]!.confidence).toBe('memory');
  });

  it('is scoped per profile', () => {
    rememberPasteMatch('Rows machine', row.id);
    setCurrentUserId('paste-memory-b');
    expect(loadPasteMemory()).toEqual({});
  });

  it('ignores a remembered exercise that is archived/missing', () => {
    rememberPasteMatch('Rows machine', 'does-not-exist');
    const parsed = parseWorkoutNotes('Rows machine: 40kg 8', SEED_EXERCISES, 'kg', loadPasteMemory());
    expect(parsed[0]!.confidence).not.toBe('memory');
  });

  it('forget removes it; corrupt storage never throws', () => {
    rememberPasteMatch('Rows machine', row.id);
    forgetPasteMatch('Rows machine');
    expect(loadPasteMemory()).toEqual({});
    store.set('anabasis.pasteMemory.paste-memory-a', '{not json');
    expect(loadPasteMemory()).toEqual({});
  });
});
