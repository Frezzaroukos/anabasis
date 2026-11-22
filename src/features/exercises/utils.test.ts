import { describe, expect, it } from 'vitest';
import type { Exercise, Skill } from '@/lib/db/types';
import {
  categoryDotClass,
  groupLibraryByCategory,
  groupLikelyDuplicates,
  matchesExerciseFilters,
  matchesLibraryFilter,
  normalizeExerciseName,
  normalizeSkillCategory,
  sortExercises,
} from './utils';

const t = '2026-01-01T00:00:00.000Z';

function makeExercise(overrides: Partial<Exercise>): Exercise {
  return {
    id: 'ex-1',
    user_id: null,
    name: 'Push-up',
    category: 'push',
    movement_type: 'compound',
    equipment: [],
    is_weighted: false,
    is_bodyweight: true,
    default_unit: 'reps',
    notes: null,
    is_archived: false,
    created_at: t,
    updated_at: t,
    deleted_at: null,
    ...overrides,
  };
}

function makeSkill(overrides: Partial<Skill>): Skill {
  return {
    id: 'sk-1',
    user_id: null,
    name: 'Planche',
    short_code: 'PL',
    category: 'push',
    description: '',
    ultimate_goal: '',
    difficulty: 4,
    display_order: 0,
    is_archived: false,
    created_at: t,
    updated_at: t,
    ...overrides,
  };
}

describe('normalizeSkillCategory', () => {
  it('ρίχνει τα skill-only categories στο αντίστοιχο exercise section', () => {
    expect(normalizeSkillCategory('lower')).toBe('legs');
    expect(normalizeSkillCategory('mixed')).toBe('other');
  });

  it('αφήνει ίδιο ό,τι ήδη ταυτίζεται', () => {
    expect(normalizeSkillCategory('push')).toBe('push');
    expect(normalizeSkillCategory('custom-thing')).toBe('custom-thing');
  });
});

describe('groupLibraryByCategory (οργανωτικό merge exercises + skills)', () => {
  it('βάζει exercise και normalized-category skill στο ΙΔΙΟ section', () => {
    const exercises = [makeExercise({ id: 'ex-legs', name: 'Squat', category: 'legs' })];
    const skills = [makeSkill({ id: 'sk-lower', name: 'Pistol Squat', category: 'lower' })];
    const groups = groupLibraryByCategory(exercises, skills, ['legs']);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.category).toBe('legs');
    expect(groups[0]!.items).toHaveLength(2);
    const kinds = groups[0]!.items.map((i) => i.kind).sort();
    expect(kinds).toEqual(['exercise', 'skill']);
  });

  it('ταξινομεί αλφαβητικά ανεξαρτήτως τύπου (exercise ή skill)', () => {
    const exercises = [makeExercise({ id: 'ex-1', name: 'Zercher Squat', category: 'legs' })];
    const skills = [makeSkill({ id: 'sk-1', name: 'Airborne Lunge', category: 'lower' })];
    const groups = groupLibraryByCategory(exercises, skills, ['legs']);

    expect(groups[0]!.items.map((i) => (i.kind === 'exercise' ? i.exercise.name : i.skill.name))).toEqual([
      'Airborne Lunge',
      'Zercher Squat',
    ]);
  });

  it('κόβει κατηγορίες χωρίς κανένα item', () => {
    const groups = groupLibraryByCategory([], [], ['push', 'pull']);
    expect(groups).toEqual([]);
  });
});

describe('matchesLibraryFilter', () => {
  const me = 'user-a';
  const mine = { user_id: me, is_archived: false };
  const builtin = { user_id: null, is_archived: false };
  const archived = { user_id: me, is_archived: true };

  it('all: δείχνει ό,τι δεν είναι archived', () => {
    expect(matchesLibraryFilter(mine, 'all', me)).toBe(true);
    expect(matchesLibraryFilter(builtin, 'all', me)).toBe(true);
    expect(matchesLibraryFilter(archived, 'all', me)).toBe(false);
  });

  it('mine: μόνο δικά σου, όχι builtin ούτε archived', () => {
    expect(matchesLibraryFilter(mine, 'mine', me)).toBe(true);
    expect(matchesLibraryFilter(builtin, 'mine', me)).toBe(false);
    expect(matchesLibraryFilter(archived, 'mine', me)).toBe(false);
  });

  it('archived: μόνο ό,τι είναι archived', () => {
    expect(matchesLibraryFilter(archived, 'archived', me)).toBe(true);
    expect(matchesLibraryFilter(mine, 'archived', me)).toBe(false);
  });
});

describe('categoryDotClass', () => {
  it('παραμένει ίδιο για τα builtin exercise categories (δεν έσπασε από το merge)', () => {
    expect(categoryDotClass('legs')).toBe('bg-category-legs');
    expect(categoryDotClass('unknown')).toBe('bg-category-mixed');
  });
});

describe('normalizeExerciseName', () => {
  it('πεζά, χωρίς παύλες και πληθυντικό: «Pull up» ≡ «Pull-ups»', () => {
    expect(normalizeExerciseName('Pull up')).toBe(normalizeExerciseName('Pull-ups'));
    expect(normalizeExerciseName('Pull-ups')).toBe('pull up');
  });

  it('αγνοεί τόνους/στίξη και περιττά κενά', () => {
    expect(normalizeExerciseName('  Barbell  Squat ')).toBe('barbell squat');
    expect(normalizeExerciseName('Κάμψεις')).toBe(normalizeExerciseName('καμψεις'));
  });

  it('δεν ενώνει λέξεις ≤3 γραμμάτων με «s» (π.χ. «abs» μένει «abs»)', () => {
    expect(normalizeExerciseName('Abs')).toBe('abs');
  });
});

describe('groupLikelyDuplicates', () => {
  it('ομαδοποιεί διπλότυπα με διαφορετικό id και ορθογραφία', () => {
    const rows = [
      makeExercise({ id: 'a', name: 'Pull up' }),
      makeExercise({ id: 'b', name: 'Pull-ups' }),
      makeExercise({ id: 'c', name: 'Squat' }),
    ];
    const groups = groupLikelyDuplicates(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('δεν προτείνει τίποτα όταν όλες είναι μοναδικές', () => {
    const rows = [
      makeExercise({ id: 'a', name: 'Bench Press' }),
      makeExercise({ id: 'b', name: 'Back Squat' }),
    ];
    expect(groupLikelyDuplicates(rows)).toEqual([]);
  });
});

describe('matchesExerciseFilters', () => {
  const me = 'user-a';
  const setCounts: Record<string, number> = { used: 5, unused: 0 };
  const setCountOf = (id: string) => setCounts[id] ?? 0;
  const base = { source: 'all' as const, category: null, usage: 'any' as const, setCountOf };

  it('φιλτράρει κατά χρήση (used/unused)', () => {
    const used = makeExercise({ id: 'used', user_id: me, name: 'U', category: 'push' });
    const unused = makeExercise({ id: 'unused', user_id: me, name: 'X', category: 'push' });
    expect(matchesExerciseFilters(used, { ...base, usage: 'used' }, me)).toBe(true);
    expect(matchesExerciseFilters(unused, { ...base, usage: 'used' }, me)).toBe(false);
    expect(matchesExerciseFilters(unused, { ...base, usage: 'unused' }, me)).toBe(true);
    expect(matchesExerciseFilters(used, { ...base, usage: 'unused' }, me)).toBe(false);
  });

  it('φιλτράρει κατά κατηγορία', () => {
    const push = makeExercise({ id: 'p', name: 'P', category: 'push' });
    expect(matchesExerciseFilters(push, { ...base, category: 'push' }, me)).toBe(true);
    expect(matchesExerciseFilters(push, { ...base, category: 'legs' }, me)).toBe(false);
  });
});

describe('sortExercises', () => {
  const summaryOf = (id: string) =>
    ({
      a: { lastTrainedAt: '2026-03-01', setCount: 2 },
      b: { lastTrainedAt: '2026-05-01', setCount: 9 },
      c: { lastTrainedAt: null, setCount: 0 },
    })[id];

  const items = [
    { id: 'a', name: 'Bravo' },
    { id: 'b', name: 'Alpha' },
    { id: 'c', name: 'Charlie' },
  ];

  it('name: αλφαβητικά', () => {
    expect(sortExercises(items, 'name', summaryOf).map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('recent: πιο πρόσφατο πρώτο', () => {
    expect(sortExercises(items, 'recent', summaryOf).map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('frequency: περισσότερα σετ πρώτα', () => {
    expect(sortExercises(items, 'frequency', summaryOf).map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });
});
