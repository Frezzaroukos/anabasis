import type { Exercise, Skill } from '@/lib/db/types';

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

/* ─────────── Οργανωτικό merge: exercises + skills στην ίδια βιβλιοθήκη ─────────── */

/**
 * Οι κατηγορίες skill (`pull/push/core/lower/mixed`) δεν ταυτίζονται λέξη-προς-λέξη
 * με των exercises (`push/pull/legs/core/other`) αλλά περιγράφουν ΤΟ ΙΔΙΟ πράγμα —
 * αυτό το mapping τις ρίχνει στο ίδιο section ώστε π.χ. «Planche» να εμφανίζεται
 * δίπλα σε push ασκήσεις, όχι σε δικό του απομονωμένο section.
 */
const SKILL_TO_EXERCISE_CATEGORY: Record<string, string> = {
  lower: 'legs',
  mixed: 'other',
};

export function normalizeSkillCategory(category: string): string {
  return SKILL_TO_EXERCISE_CATEGORY[category] ?? category;
}

export type LibraryItem =
  | { kind: 'exercise'; exercise: Exercise }
  | { kind: 'skill'; skill: Skill };

export interface LibraryCategoryGroup {
  category: string;
  items: LibraryItem[];
}

/** all/mine/archived — ίδιο φίλτρο για exercises ΚΑΙ skills (ίδιο σχήμα user_id/is_archived). */
export type LibraryFilter = 'all' | 'mine' | 'archived';

export function matchesLibraryFilter(
  row: { user_id: string | null; is_archived: boolean },
  filter: LibraryFilter,
  currentUserId: string,
): boolean {
  if (filter === 'archived') return row.is_archived;
  if (row.is_archived) return false;
  if (filter === 'mine') return row.user_id === currentUserId;
  return true;
}

/**
 * Ενοποιημένη βιβλιοθήκη: exercises + skills στα ΙΔΙΑ category sections, με το
 * skill να ξεχωρίζει οπτικά (SkillIcon + rung stack) αντί για ξεχωριστό «marker»
 * badge — λιγότερο θόρυβος, ίδιο αποτέλεσμα αναγνωρισιμότητας.
 */
export function groupLibraryByCategory(
  exercises: Exercise[],
  skills: Skill[],
  categories: string[],
): LibraryCategoryGroup[] {
  const buckets = new Map<string, LibraryItem[]>();
  for (const exercise of exercises) {
    const arr = buckets.get(exercise.category) ?? [];
    arr.push({ kind: 'exercise', exercise });
    buckets.set(exercise.category, arr);
  }
  for (const skill of skills) {
    const category = normalizeSkillCategory(skill.category);
    const arr = buckets.get(category) ?? [];
    arr.push({ kind: 'skill', skill });
    buckets.set(category, arr);
  }
  const nameOf = (item: LibraryItem) => (item.kind === 'exercise' ? item.exercise.name : item.skill.name);
  return categories
    .map((category) => ({
      category,
      items: (buckets.get(category) ?? []).sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    }))
    .filter((g) => g.items.length > 0);
}
