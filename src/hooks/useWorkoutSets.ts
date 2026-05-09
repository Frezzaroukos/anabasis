import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { SetEntry } from '@/lib/db/types';

/** All non-deleted sets for a workout, ordered by exercise then set_number. */
export function useWorkoutSets(workoutId: string | null | undefined): SetEntry[] {
  return (
    useLiveQuery(async () => {
      if (!workoutId) return [];
      const all = await db.sets.where('workout_id').equals(workoutId).toArray();
      return all
        .filter((s) => s.deleted_at == null)
        .sort((a, b) => {
          if (a.exercise_id !== b.exercise_id) {
            return a.exercise_id.localeCompare(b.exercise_id);
          }
          return a.set_number - b.set_number;
        });
    }, [workoutId]) ?? []
  );
}

/** Distinct exercise IDs that have at least one set logged in this workout, in insertion order. */
export function useWorkoutExerciseIds(workoutId: string | null | undefined): string[] {
  return (
    useLiveQuery(async () => {
      if (!workoutId) return [];
      const sets = await db.sets.where('workout_id').equals(workoutId).toArray();
      const seen = new Set<string>();
      const order: string[] = [];
      for (const s of sets.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
        if (s.deleted_at != null) continue;
        if (!seen.has(s.exercise_id)) {
          seen.add(s.exercise_id);
          order.push(s.exercise_id);
        }
      }
      return order;
    }, [workoutId]) ?? []
  );
}
