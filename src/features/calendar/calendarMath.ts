import type { DayActivities } from '@/lib/db/queries';

/**
 * `YYYY-MM-DD` → Date στο ΤΟΠΙΚΟ μεσάνυχτα.
 *
 * Το `new Date('2026-08-15')` διαβάζει τη χορδή ως UTC — δυτικά του UTC
 * (π.χ. Νέα Υόρκη) δίνει την ΠΡΟΗΓΟΥΜΕΝΗ τοπική μέρα, οπότε η ημερομηνία
 * στο header/aria-label ήταν off-by-one. Χτίζουμε από y/m/d όπως το
 * `localNoon` του query layer.
 */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export type DotSize = 'sm' | 'md' | 'lg';

type WorkoutEntry = DayActivities['workouts'][number];

/** Tailwind μέγεθος (w/h) ανά τιμή DotSize — dot = προπόνηση εκείνης της μέρας. */
export const DOT_SIZE_CLASS: Record<DotSize, string> = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2 w-2',
  lg: 'h-2.5 w-2.5',
};

/**
 * «Πόσο» ήταν η προπόνηση — dot που μεγαλώνει με το μέγεθος, όχι πάντα ίδιο
 * μέγεθος για ένα quick mobility set και για μια βαριά συνεδρία 20 σετ.
 * Set-logged δραστηριότητες μετρούν σετ· χρόνο/απόσταση-based (run/bike/…,
 * sets πάντα 0) μετρούν διάρκεια — δεν υπάρχει κοινή μονάδα, γι' αυτό δύο
 * ξεχωριστές κλίμακες αντί για μία λάθος-συγκρίσιμη.
 */
export function dotSizeOf(w: WorkoutEntry): DotSize {
  if (w.sets > 0) {
    if (w.sets >= 15) return 'lg';
    if (w.sets >= 6) return 'md';
    return 'sm';
  }
  const minutes = (w.durationSeconds ?? 0) / 60;
  if (minutes >= 45) return 'lg';
  if (minutes >= 15) return 'md';
  return 'sm';
}

/** Στατικές Tailwind κλάσεις (JIT-safe, όχι δυναμικά arbitrary values). */
const ADHERENCE_TINT: readonly string[] = ['', 'bg-primary/5', 'bg-primary/10', 'bg-primary/15'];

/**
 * Χρωματικό "overlay" ανά εβδομάδα — πόσες μέρες προπονήθηκες αυτή την
 * εβδομάδα, ως απαλό background wash πίσω από τα κελιά της (κάθε κελί της
 * ίδιας εβδομάδας παίρνει το ΙΔΙΟ tier, οπότε διαβάζεται σαν "ζώνη" παρόλο
 * που το grid παραμένει flat). Μηδέν προπονήσεις → καθόλου tint (δεν
 * τιμωρεί οπτικά μια κενή εβδομάδα, απλά δεν την τονίζει).
 */
export function weekAdherenceTint(
  weekKeys: readonly (string | null)[],
  cal: Map<string, DayActivities>,
): string {
  const realKeys = weekKeys.filter((k): k is string => k !== null);
  if (realKeys.length === 0) return '';
  const trainedDays = realKeys.filter((k) => (cal.get(k)?.workouts.length ?? 0) > 0).length;
  const ratio = trainedDays / realKeys.length;
  if (ratio <= 0) return ADHERENCE_TINT[0]!;
  if (ratio < 0.3) return ADHERENCE_TINT[1]!;
  if (ratio < 0.6) return ADHERENCE_TINT[2]!;
  return ADHERENCE_TINT[3]!;
}
