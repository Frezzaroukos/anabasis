import { describe, expect, it } from 'vitest';
import { splitExerciseList } from './exerciseList';

const ex = (id: string, name: string) => ({ id, name });

describe('splitExerciseList', () => {
  const exercises = [ex('a', 'Alpha'), ex('b', 'Bravo'), ex('c', 'Charlie'), ex('d', 'Delta'), ex('e', 'Echo')];
  const summaries = new Map([
    ['a', { lastTrainedAt: '2026-11-01T10:00:00.000Z' }],
    ['b', { lastTrainedAt: null }],
    ['c', { lastTrainedAt: '2026-11-20T10:00:00.000Z' }],
    ['d', { lastTrainedAt: '2026-11-20T10:00:00.000Z' }],
  ]);

  it('προπονημένες: πιο πρόσφατες πρώτα (ισοπαλία → αλφαβητικά)', () => {
    expect(splitExerciseList(exercises, summaries).trained.map((e) => e.id)).toEqual(['c', 'd', 'a']);
  });
  it('μη προπονημένες (και χωρίς summary) χωριστά, αλφαβητικά', () => {
    expect(splitExerciseList(exercises, summaries).untrained.map((e) => e.id)).toEqual(['b', 'e']);
  });
  it('κενή είσοδος', () => {
    expect(splitExerciseList([], new Map())).toEqual({ trained: [], untrained: [] });
  });
});
