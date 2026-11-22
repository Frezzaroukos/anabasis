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

/* ─────────── Ανίχνευση διπλότυπων ασκήσεων ─────────── */

/**
 * Κανονικοποιεί ένα όνομα άσκησης για σύγκριση «μοιάζουν;»:
 *  - πεζά, χωρίς τόνους (NFD + strip diacritics),
 *  - παύλες/κάτω-παύλες/στίξη → κενό,
 *  - ενικό πληθυντικού: drop trailing «s» σε κάθε λέξη («pull-ups»→«pull up»,
 *    «squats»→«squat»).
 * Δεν είναι ταυτότητα (δεν αντικαθιστά το id) — είναι μόνο πρόταση ένωσης.
 */
export function normalizeExerciseName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // τόνοι/διαλυτικά
    .toLowerCase()
    .replace(/[^a-z0-9α-ω]+/g, ' ') // στίξη/παύλες → κενό (κρατά ελληνικά)
    .trim();
  const words = base.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  // Πληθυντικός: μόνο η ΤΕΛΕΥΤΑΙΑ λέξη — «pull ups»→«pull up», «squats»→«squat»,
  // αλλά «abs» (μονή, 3 γράμματα) μένει «abs». Πολυ-λέξεις: πάντα, εφόσον >2.
  const last = words[words.length - 1]!;
  const singularizable =
    last.length >= 3 && last.endsWith('s') && (words.length > 1 || last.length > 3);
  if (singularizable) words[words.length - 1] = last.slice(0, -1);
  return words.join(' ');
}

/**
 * Ομαδοποιεί ασκήσεις που έχουν το ίδιο κανονικοποιημένο όνομα (≥2 μέλη).
 * Επιστρέφει μόνο τα groups με πραγματικό διπλότυπο — οι μοναδικές μένουν έξω.
 * Κρατά σταθερή σειρά: τα groups ταξινομημένα κατά όνομα.
 */
export function groupLikelyDuplicates<T extends { id: string; name: string }>(
  exercises: T[],
): T[][] {
  const buckets = new Map<string, T[]>();
  for (const ex of exercises) {
    const key = normalizeExerciseName(ex.name);
    if (!key) continue;
    const arr = buckets.get(key) ?? [];
    arr.push(ex);
    buckets.set(key, arr);
  }
  return [...buckets.entries()]
    .filter(([, arr]) => arr.length > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, arr]) => arr);
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

/** Φίλτρα βιβλιοθήκης ασκήσεων: πηγή (όλα/δικά μου/αρχειοθετημένα) + χρήση + κατηγορία. */
export type UsageFilter = 'any' | 'used' | 'unused';

export interface ExerciseListFilters {
  source: LibraryFilter;
  category: string | null;
  usage: UsageFilter;
  /** Πόσα live σετ έχει η άσκηση (από getExerciseSummaries). */
  setCountOf: (id: string) => number;
}

export function matchesExerciseFilters(
  ex: { id: string; user_id: string | null; is_archived: boolean; category: string },
  f: ExerciseListFilters,
  currentUserId: string,
): boolean {
  if (!matchesLibraryFilter(ex, f.source, currentUserId)) return false;
  if (f.category != null && ex.category !== f.category) return false;
  if (f.usage !== 'any') {
    const used = f.setCountOf(ex.id) > 0;
    if (f.usage === 'used' && !used) return false;
    if (f.usage === 'unused' && used) return false;
  }
  return true;
}

/** Ταξινόμηση βιβλιοθήκης: αλφαβητικά, πρόσφατα εκτελεσμένη, πιο συχνά/πολλά σετ. */
export type LibrarySort = 'name' | 'recent' | 'frequency';

export function sortExercises<T extends { id: string; name: string }>(
  items: T[],
  sort: LibrarySort,
  summaryOf: (id: string) => { lastTrainedAt: string | null; setCount: number } | undefined,
): T[] {
  const copy = [...items];
  if (sort === 'name') return copy.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'recent') {
    return copy.sort((a, b) => {
      const la = summaryOf(a.id)?.lastTrainedAt ?? '';
      const lb = summaryOf(b.id)?.lastTrainedAt ?? '';
      if (la !== lb) return lb.localeCompare(la); // πιο πρόσφατο πρώτο
      return a.name.localeCompare(b.name);
    });
  }
  // frequency: περισσότερα σετ πρώτα, tie → όνομα
  return copy.sort((a, b) => {
    const ca = summaryOf(a.id)?.setCount ?? 0;
    const cb = summaryOf(b.id)?.setCount ?? 0;
    if (cb !== ca) return cb - ca;
    return a.name.localeCompare(b.name);
  });
}

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
 * skill να ξεχωρίζει οπτικά (SkillMark + rung stack) αντί για ξεχωριστό «marker»
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
