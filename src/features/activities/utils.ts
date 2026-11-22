/**
 * Παλέτα χρωμάτων για την κουκκίδα δραστηριότητας στο ημερολόγιο. Σταθερή
 * λίστα από γνωστές Tailwind classes (όχι δυναμικό template string) ώστε
 * το JIT scanner να τις εντοπίζει σίγουρα στο build.
 */
export const ACTIVITY_DOT_COLORS = [
  'bg-sky-400',
  'bg-violet-400',
  'bg-emerald-400',
  'bg-amber-400',
  'bg-cyan-400',
  'bg-blue-400',
  'bg-rose-400',
  'bg-zinc-400',
  'bg-orange-400',
  'bg-lime-400',
  'bg-fuchsia-400',
  'bg-teal-400',
] as const;

/**
 * i18n key (ΔΕΝ είναι tailwind class) για κάθε χρώμα — ώστε το aria-label του
 * χρωματικού picker να λέει «Κόκκινο» αντί για το raw `bg-rose-400`. Ο screen
 * reader δεν έχει νόημα από tailwind classes.
 */
export const ACTIVITY_COLOR_NAME_KEY: Record<string, string> = {
  'bg-sky-400': 'activities.colors.sky',
  'bg-violet-400': 'activities.colors.violet',
  'bg-emerald-400': 'activities.colors.emerald',
  'bg-amber-400': 'activities.colors.amber',
  'bg-cyan-400': 'activities.colors.cyan',
  'bg-blue-400': 'activities.colors.blue',
  'bg-rose-400': 'activities.colors.rose',
  'bg-zinc-400': 'activities.colors.zinc',
  'bg-orange-400': 'activities.colors.orange',
  'bg-lime-400': 'activities.colors.lime',
  'bg-fuchsia-400': 'activities.colors.fuchsia',
  'bg-teal-400': 'activities.colors.teal',
};
