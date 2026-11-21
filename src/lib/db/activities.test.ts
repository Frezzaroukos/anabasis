import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import { deleteActivity } from './activities';
import { createActivity, listActivities } from './queries';
import type { Activity } from './types';

/**
 * Διαγραφή δικής σου δραστηριότητας: soft delete (tombstone για sync), ποτέ
 * builtin (κοινά σε όλα τα προφίλ), ποτέ δραστηριότητα άλλου χρήστη.
 */
beforeEach(async () => {
  setCurrentUserId('activity-delete-test');
  await db.activities.clear();
});

async function addBuiltin(): Promise<Activity> {
  const t = new Date().toISOString();
  const a: Activity = {
    id: 'builtin-activity',
    user_id: null,
    key: 'strength',
    label: 'Strength',
    icon: '▲',
    dot_class: 'bg-zinc-400',
    uses_sets: true,
    tracks_distance: false,
    is_builtin: true,
    is_archived: false,
    display_order: 0,
    created_at: t,
    updated_at: t,
  };
  await db.activities.add(a);
  return a;
}

describe('deleteActivity', () => {
  it('κάνει soft delete τη δική σου δραστηριότητα και την κρύβει από τη λίστα', async () => {
    const a = await createActivity({ label: 'Παρκούρ' });
    expect(await deleteActivity(a.id)).toBe('deleted');

    const row = await db.activities.get(a.id);
    expect(row?.deleted_at).toBeTruthy();
    expect((await listActivities()).some((x) => x.id === a.id)).toBe(false);
    expect(await deleteActivity(a.id)).toBe('deleted');
  });

  it('δεν αγγίζει builtin δραστηριότητα', async () => {
    const builtin = await addBuiltin();
    expect(await deleteActivity(builtin.id)).toBe('builtin');
    expect((await db.activities.get(builtin.id))?.deleted_at).toBeFalsy();
    expect((await listActivities()).some((x) => x.id === builtin.id)).toBe(true);
  });

  it('επιστρέφει not-found για άγνωστο id', async () => {
    expect(await deleteActivity('missing')).toBe('not-found');
  });
});
