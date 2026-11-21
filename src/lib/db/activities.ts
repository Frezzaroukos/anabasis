/**
 * Διαγραφή δικής σου δραστηριότητας — soft delete, ώστε η διαγραφή να
 * ταξιδεύει στις άλλες συσκευές (tombstone) όπως κάθε user-data row.
 *
 * Ξεχωριστό module από το queries.ts (parse threshold του oxc) και από το
 * trackers.ts (διαφορετικό domain). Τα builtin rows (`user_id === null`)
 * είναι κοινά σε όλα τα προφίλ της συσκευής — δεν διαγράφονται ποτέ από εδώ.
 */
import { db } from './schema';
import { getCurrentUserId } from './session';

const now = () => new Date().toISOString();

export type DeleteActivityResult = 'deleted' | 'not-found' | 'builtin';

export async function deleteActivity(id: string): Promise<DeleteActivityResult> {
  const activity = await db.activities.get(id);
  if (!activity) return 'not-found';
  if (activity.user_id !== getCurrentUserId()) return 'builtin';

  const t = now();
  await db.activities.update(id, { deleted_at: t, updated_at: t });
  return 'deleted';
}
