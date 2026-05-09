import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { Exercise } from '@/lib/db/types';

export function useExercises(): Exercise[] {
  return (
    useLiveQuery(async () => {
      const all = await db.exercises.toArray();
      return all
        .filter((e) => e.deleted_at == null && !e.is_archived)
        .sort((a, b) => a.name.localeCompare(b.name));
    }, []) ?? []
  );
}
