import {
  Activity as ActivityGlyph,
  Bike,
  Dumbbell,
  Footprints,
  Heart,
  MountainSnow,
  Music,
  PersonStanding,
  Sparkles,
  Target,
  Timer,
  Waves,
  type LucideIcon,
} from 'lucide-react';

/**
 * Activity icons — vector (lucide), not emoji. Emojis change design per platform,
 * don't take theme colors, and don't align with text; a lucide icon does all three.
 *
 * `activity.icon` stores the NAME of an icon from here (constant string, not
 * component) — so it syncs as plain data.
 */
export const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  dumbbell: Dumbbell,
  sparkles: Sparkles,
  run: Footprints,
  bike: Bike,
  swim: Waves,
  ball: ActivityGlyph,
  stretch: PersonStanding,
  heart: Heart,
  mountain: MountainSnow,
  target: Target,
  timer: Timer,
  music: Music,
};

/** Display order in the picker. */
export const ACTIVITY_ICON_NAMES = Object.keys(ACTIVITY_ICONS);

/** Builtin key → logical icon, for seeds without an icon name. */
export const BUILTIN_ICON: Record<string, string> = {
  strength: 'dumbbell',
  skill: 'sparkles',
  run: 'run',
  cycling: 'bike',
  swim: 'swim',
  basketball: 'ball',
  mobility: 'stretch',
  other: 'target',
};

/** Resolve icon component: saved name → builtin key → generic fallback. */
export function resolveActivityIcon(
  activity: Pick<{ key: string; icon?: string }, 'key' | 'icon'>,
): LucideIcon {
  const byName = activity.icon ? ACTIVITY_ICONS[activity.icon] : undefined;
  if (byName) return byName;
  const byKey = BUILTIN_ICON[activity.key];
  return (byKey && ACTIVITY_ICONS[byKey]) || ActivityGlyph;
}