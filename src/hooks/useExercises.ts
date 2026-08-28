import { useLiveQuery } from 'dexie-react-hooks';
import { listExercises } from '@/lib/db/queries';
import type { Exercise } from '@/lib/db/types';

/**
 * Πριν διάβαζε `db.exercises.toArray()` απευθείας, χωρίς isVisibleToMe —
 * οι δικές σου ασκήσεις διέρρεαν σε κάθε άλλο προφίλ της συσκευής.
 * Το listExercises() κάνει το σωστό φιλτράρισμα (seeded + δικές σου).
 */
export function useExercises(): Exercise[] {
  return useLiveQuery(() => listExercises(), []) ?? [];
}
