import type { ExerciseCategory, ProgramExercise } from '@/lib/db/types';

/** Ίδιο pattern με τα άλλα features (SkillsPage/workout/utils) — dot ανά κατηγορία. */
export const CATEGORY_DOT: Record<ExerciseCategory, string> = {
  push: 'bg-category-push',
  pull: 'bg-category-pull',
  legs: 'bg-category-legs',
  core: 'bg-category-core',
  other: 'bg-category-mixed',
};

export type ProgramGroupKind = 'single' | 'superset' | 'dropset';

export interface ProgramGroup {
  /** group_key για αλυσίδες, id της γραμμής για μονές ασκήσεις */
  key: string;
  kind: ProgramGroupKind;
  items: ProgramExercise[];
}

/**
 * Ομαδοποιεί τις γραμμές ενός προγράμματος σε αλυσίδες βάσει group_key.
 * Ίδιο group_key + ΙΔΙΑ άσκηση → dropset, ίδιο group_key + διαφορετικές
 * ασκήσεις → superset. Η σειρά εμφάνισης ακολουθεί την πρώτη εμφάνιση κάθε
 * group_key, ώστε να δουλεύει ακόμα κι αν οι γραμμές μιας αλυσίδας δεν είναι
 * διαδοχικές στο position array.
 */
export function groupProgramExercises(exercises: ProgramExercise[]): ProgramGroup[] {
  const groups: ProgramGroup[] = [];
  const seenKeys = new Set<string>();

  for (const item of exercises) {
    if (item.group_key == null) {
      groups.push({ key: item.id, kind: 'single', items: [item] });
      continue;
    }
    if (seenKeys.has(item.group_key)) continue;
    seenKeys.add(item.group_key);

    const members = exercises.filter((e) => e.group_key === item.group_key);
    const first = members[0] ?? item;
    const sameExercise = members.every((m) => m.exercise_id === first.exercise_id);
    groups.push({
      key: item.group_key,
      kind: members.length <= 1 ? 'single' : sameExercise ? 'dropset' : 'superset',
      items: members,
    });
  }
  return groups;
}

/** Επίπεδη λίστα ids από ομάδες, με τη σειρά τους — έτοιμη για reorderProgramExercises. */
export function flattenGroupOrder(groups: ProgramGroup[]): string[] {
  return groups.flatMap((g) => g.items.map((i) => i.id));
}
