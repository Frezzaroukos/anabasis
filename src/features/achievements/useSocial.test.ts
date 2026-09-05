import { describe, it, expect } from 'vitest';
import { statsBodyFromInput, badgeCount } from './useSocial';
import { totalXp, type GamificationInput } from '@/lib/gamification';

const base: GamificationInput = {
  completedWorkouts: 12,
  totalSets: 200,
  prCount: 4,
  masteredSteps: 3,
  masteredSkills: 1,
  streakDays: 5,
  longestStreakDays: 9,
};

describe('statsBodyFromInput', () => {
  it('στέλνει μόνο client-authoritative πεδία (xp/streaks/badges), όχι level/tier', () => {
    const body = statsBodyFromInput(base);
    expect(body.xp).toBe(totalXp(base));
    expect(body.streak_days).toBe(5);
    expect(body.longest_streak_days).toBe(9);
    // Ο server παράγει level/tier — δεν τα στέλνουμε.
    expect(body).not.toHaveProperty('level');
    expect(body).not.toHaveProperty('tier');
  });

  it('περιλαμβάνει μόνο earned badge ids', () => {
    const body = statsBodyFromInput(base);
    // 12 workouts → first-ascent + ten-sessions· 9-day streak → week-streak·
    // 1 mastered skill → first-skill. ΟΧΙ century/month-streak/record-breaker.
    expect(body.badges).toContain('first-ascent');
    expect(body.badges).toContain('ten-sessions');
    expect(body.badges).toContain('week-streak');
    expect(body.badges).toContain('first-skill');
    expect(body.badges).not.toContain('century');
    expect(body.badges).not.toContain('month-streak');
    expect(body.badges).not.toContain('record-breaker');
  });

  it('φρέσκο προφίλ → xp 0, καθόλου badges', () => {
    const empty: GamificationInput = {
      completedWorkouts: 0,
      totalSets: 0,
      prCount: 0,
      masteredSteps: 0,
      masteredSkills: 0,
      streakDays: 0,
      longestStreakDays: 0,
    };
    const body = statsBodyFromInput(empty);
    expect(body.xp).toBe(0);
    expect(body.badges).toEqual([]);
  });
});

describe('badgeCount', () => {
  it('μετρά earned badges από το JSON string', () => {
    expect(badgeCount('["first-ascent","ten-sessions"]')).toBe(2);
    expect(badgeCount('[]')).toBe(0);
  });

  it('offline/corrupt JSON → 0 (καμία εξαίρεση)', () => {
    expect(badgeCount('not json')).toBe(0);
    expect(badgeCount('')).toBe(0);
    expect(badgeCount('{"a":1}')).toBe(0);
  });
});
