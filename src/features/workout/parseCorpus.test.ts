import { describe, expect, it } from 'vitest';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import type { Exercise } from '@/lib/db/types';
import { parseWorkoutNotes } from './parseWorkoutNotes';
import { CORPUS } from './parseCorpus';

const custom = (id: string, name: string, isHold = false): Exercise =>
  ({
    id, user_id: 'u1', name, category: 'pull', movement_type: 'compound', equipment: [],
    is_weighted: true, is_bodyweight: false, default_unit: isHold ? 'sec' : 'kg', notes: null,
    is_archived: false, created_at: '', updated_at: '', deleted_at: null,
  }) as Exercise;

// Βιβλιοθήκη όπως του Aggelos: seeds + δικές του ασκήσεις (skills ως hold).
const LIB: Exercise[] = [
  ...SEED_EXERCISES,
  custom('c-flr', 'Front Lever Row'),
  { ...custom('c-mu', 'Muscle Up'), is_bodyweight: true },
  custom('c-hs', 'Handstand', true),
  custom('c-fl', 'Front Lever', true),
  custom('c-pl', 'Planche Lean', true),
];

describe('Quick Paste corpus', () => {
  it.each(CORPUS.map((c) => [c.line, c] as const))('%s', (_label, c) => {
    const parsed = parseWorkoutNotes(c.line, LIB, 'kg');
    expect(parsed, 'line must be recognised').toHaveLength(1);
    const p = parsed[0]!;
    const name = LIB.find((e) => e.id === p.matchedExerciseId)?.name ?? null;
    expect(name).toBe(c.exercise);
    expect(p.sets.map((s) => [s.weightKg == null ? null : Math.round(s.weightKg * 10) / 10, s.reps])).toEqual(c.sets);
    if (c.suspect) expect(p.hasSuspectValues).toBe(true);
  });

  it('parses the whole corpus pasted as one multi-line note (no cross-line bleed)', () => {
    const parsed = parseWorkoutNotes(CORPUS.map((c) => c.line).join('\n'), LIB, 'kg');
    expect(parsed).toHaveLength(CORPUS.length);
    parsed.forEach((p, i) => {
      expect(LIB.find((e) => e.id === p.matchedExerciseId)?.name ?? null).toBe(CORPUS[i]!.exercise);
    });
  });

  it('respects lb as the default unit for unitless weights', () => {
    const p = parseWorkoutNotes('Bench 135 5,5', LIB, 'lb')[0]!;
    expect(p.sets).toHaveLength(2);
    expect(p.sets[0]!.weightKg).toBeCloseTo(61.2, 1);
  });
});
