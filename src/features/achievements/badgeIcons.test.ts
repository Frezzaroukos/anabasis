import { describe, expect, it } from 'vitest';
import { BADGES } from '@/lib/gamification';
import { BADGE_VISUALS, FALLBACK_BADGE_VISUAL } from './badgeIcons';

describe('badge visuals', () => {
  it('maps every badge to a distinct icon and tint', () => {
    const mapped = BADGES.map((b) => BADGE_VISUALS[b.id]);
    expect(mapped.every(Boolean)).toBe(true);
    expect(new Set(mapped.map((v) => v!.Icon)).size).toBe(BADGES.length);
    expect(new Set(mapped.map((v) => v!.tone)).size).toBe(BADGES.length);
  });

  it('has no stale badge ids and tints every medallion', () => {
    expect(Object.keys(BADGE_VISUALS).sort()).toEqual(BADGES.map((b) => b.id).sort());
    for (const visual of Object.values(BADGE_VISUALS)) {
      expect(visual).not.toBe(FALLBACK_BADGE_VISUAL);
      expect(visual.tone).toMatch(/\btext-/);
      expect(visual.tone).toMatch(/\bbg-/);
    }
  });
});
