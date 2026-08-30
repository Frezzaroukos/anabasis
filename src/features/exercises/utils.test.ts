import { describe, expect, it } from 'vitest';
import type { Exercise, Skill } from '@/lib/db/types';
import {
  categoryDotClass,
  groupLibraryByCategory,
  matchesLibraryFilter,
  normalizeSkillCategory,
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
