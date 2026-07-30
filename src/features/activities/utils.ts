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
