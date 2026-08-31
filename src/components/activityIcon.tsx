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
import type { Activity } from '@/lib/db/types';

/**
 * Σύμβολα δραστηριότητας — vector (lucide), όχι emoji. Ένα emoji αλλάζει σχέδιο
 * ανά πλατφόρμα, δεν παίρνει το χρώμα του θέματος και δεν ευθυγραμμίζεται με το
 * κείμενο· ένα lucide icon τα κάνει και τα τρία, οπότε το «ωραίο σύμβολο» δεν
 * κοστίζει τη συνέπεια. Το χρώμα της δραστηριότητας μένει ως δεύτερο σήμα.
 *
 * Το `activity.icon` κρατά ΤΟ ΟΝΟΜΑ ενός icon από εδώ (σταθερό string, όχι
 * component) — έτσι συγχρονίζεται σαν απλό δεδομένο.
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

/** Η σειρά που εμφανίζονται στον picker. */
export const ACTIVITY_ICON_NAMES = Object.keys(ACTIVITY_ICONS);

/** Builtin κλειδί → λογικό εικονίδιο, για τα σπόρια που δεν έχουν όνομα icon. */
const BUILTIN_ICON: Record<string, string> = {
  strength: 'dumbbell',
  skill: 'sparkles',
  run: 'run',
  cycling: 'bike',
  swim: 'swim',
  basketball: 'ball',
  mobility: 'stretch',
  other: 'target',
};

/** Επιλέγει το component: αποθηκευμένο όνομα → builtin key → γενικό. */
export function resolveActivityIcon(
  activity: Pick<Activity, 'key' | 'icon'>,
): LucideIcon {
  const byName = activity.icon ? ACTIVITY_ICONS[activity.icon] : undefined;
  if (byName) return byName;
  const byKey = BUILTIN_ICON[activity.key];
  return (byKey && ACTIVITY_ICONS[byKey]) || ActivityGlyph;
}

/**
 * Το σύμβολο μιας δραστηριότητας, χρωματισμένο στο χρώμα της (text-* από το
 * dot_class, π.χ. `bg-category-push` → `text-category-push`).
 */
export function ActivityIcon({
  activity,
  className,
}: {
  activity: Pick<Activity, 'key' | 'icon' | 'dot_class'>;
  className?: string;
}) {
  const Icon = resolveActivityIcon(activity);
  const color = activity.dot_class?.replace(/^bg-/, 'text-') ?? '';
  return <Icon className={[color, className].filter(Boolean).join(' ')} aria-hidden />;
}
