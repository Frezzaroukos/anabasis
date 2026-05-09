import type { ExerciseCategory } from '@/lib/db/types';

export const CATEGORY_DOT: Record<ExerciseCategory, string> = {
  push: 'bg-category-push',
  pull: 'bg-category-pull',
  legs: 'bg-category-legs',
  core: 'bg-category-core',
  other: 'bg-category-mixed',
};

export function formatLoad(weightKg: number | null, bodyweightKg: number | null): string {
  if (weightKg != null && bodyweightKg != null) {
    return `BW+${weightKg}kg`;
  }
  if (weightKg != null) return `${weightKg}kg`;
  return 'BW';
}
