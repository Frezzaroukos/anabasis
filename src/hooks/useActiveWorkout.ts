import { useLiveQuery } from 'dexie-react-hooks';
import { db, } from '@/lib/db';
import { getCurrentUserId } from '@/lib/db/session';
import type { Workout } from '@/lib/db/types';

export function useActiveWorkout(): Workout | null | undefined {
  // undefined = loading; null = none; Workout = active.
  const result = useLiveQuery(async () => {
    const all = await db.workouts.where('user_id').equals(getCurrentUserId()).toArray();
    const active = all
      .filter((w) => w.ended_at == null && w.deleted_at == null)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
    return active ?? null;
  }, []);

  return result;
}
