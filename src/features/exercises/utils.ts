import type { Exercise } from '@/lib/db/types';

/**
 * Χρώμα κουκκίδας ανά κατηγορία. Οι builtin κατηγορίες έχουν δικό τους tone·
 * οποιαδήποτε δική σου κατηγορία («grip», «neck»…) πέφτει στο ίδιο ουδέτερο
 * χρώμα με το «other» — δεν παράγουμε δυναμικά tailwind classes από
 * ελεύθερο string (θα τα έκοβε το JIT purge).
 */
const CATEGORY_DOT_COLORS: Record<string, string> = {
  push: 'bg-category-push',
  pull: 'bg-category-pull',
  legs: 'bg-category-legs',
  core: 'bg-category-core',
  other: 'bg-category-mixed',
};

export function categoryDotClass(category: string): string {
  return CATEGORY_DOT_COLORS[category] ?? 'bg-category-mixed';
}

export interface ExerciseCategoryGroup {
  category: string;
  items: Exercise[];
}

/**
 * Ομαδοποιεί τις ασκήσεις ανά κατηγορία, με τη σειρά των `categories`
 * (ήδη αλφαβητικά από `listExerciseCategories`). Άδειες κατηγορίες κόβονται.
 */
export function groupExercisesByCategory(
  exercises: Exercise[],
  categories: string[],
): ExerciseCategoryGroup[] {
  const buckets = new Map<string, Exercise[]>();
  for (const ex of exercises) {
    const arr = buckets.get(ex.category) ?? [];
    arr.push(ex);
    buckets.set(ex.category, arr);
  }
  return categories
    .map((category) => ({ category, items: buckets.get(category) ?? [] }))
    .filter((g) => g.items.length > 0);
}
