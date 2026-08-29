import { describe, expect, it } from 'vitest';
import {
  totalXp,
  levelFromXp,
  xpForLevel,
  levelProgress,
  tierForLevel,
  badgeStates,
  hasActivity,
  XP_PER,
  type GamificationInput,
} from './gamification';

const EMPTY: GamificationInput = {
  completedWorkouts: 0,
  totalSets: 0,
  prCount: 0,
  masteredSteps: 0,
  masteredSkills: 0,
  streakDays: 0,
  longestStreakDays: 0,
};

describe('gamification', () => {
  it('μηδέν δραστηριότητα → επίπεδο 1, μηδέν XP, κανένα badge', () => {
    expect(totalXp(EMPTY)).toBe(0);
    expect(levelFromXp(0)).toBe(1);
    expect(hasActivity(EMPTY)).toBe(false);
    expect(badgeStates(EMPTY).every((b) => !b.isEarned)).toBe(true);
  });

  it('XP formula αθροίζει σωστά κάθε πηγή', () => {
    const d: GamificationInput = { ...EMPTY, completedWorkouts: 3, totalSets: 20, prCount: 2, masteredSteps: 4 };
    expect(totalXp(d)).toBe(
      3 * XP_PER.workout + 20 * XP_PER.set + 2 * XP_PER.pr + 4 * XP_PER.skillStep,
    );
  });

  it('τα όρια επιπέδων είναι αντιστρέψιμα', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(400);
    expect(levelFromXp(xpForLevel(5))).toBe(5);
    expect(levelFromXp(xpForLevel(5) - 1)).toBe(4);
  });

  it('levelProgress δίνει σωστό κλάσμα εντός επιπέδου', () => {
    // Στη μέση μεταξύ level 2 (100) και level 3 (400): xp=250 → 150/300 = 0.5
    const p = levelProgress(250);
    expect(p.level).toBe(2);
    expect(p.fraction).toBeCloseTo(0.5, 5);
  });

  it('τα tiers ανεβαίνουν με το επίπεδο', () => {
    expect(tierForLevel(1).key).toBe('baseCamp');
    expect(tierForLevel(6).key).toBe('ridge');
    expect(tierForLevel(12).key).toBe('alpine');
    expect(tierForLevel(20).key).toBe('summit');
    expect(tierForLevel(40).key).toBe('stratosphere');
  });

  it('badges κερδίζονται στα σωστά κατώφλια', () => {
    const first = badgeStates({ ...EMPTY, completedWorkouts: 1 });
    expect(first.find((b) => b.id === 'first-ascent')?.isEarned).toBe(true);
    expect(first.find((b) => b.id === 'ten-sessions')?.isEarned).toBe(false);

    const streak = badgeStates({ ...EMPTY, longestStreakDays: 7 });
    expect(streak.find((b) => b.id === 'week-streak')?.isEarned).toBe(true);

    const skill = badgeStates({ ...EMPTY, masteredSkills: 1 });
    expect(skill.find((b) => b.id === 'first-skill')?.isEarned).toBe(true);
  });
});
