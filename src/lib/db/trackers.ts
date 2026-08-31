/**
 * Custom Trackers — δικοί σου μετρητές, φτιαγμένοι επί τόπου, που μένουν σαν
 * επιλογή (όπως τα activities/exercises). Η πρόοδος είναι άθροισμα από entries
 * (append-only): κάθε +1/−N είναι δική του γραμμή, οπότε συγχρονίζεται καθαρά
 * και «κλείνει» ανά περίοδο σαν κάθε άλλο metric.
 *
 * Ξεχωριστό module (όχι queries.ts): το queries.ts κάθεται ακριβώς στο parse
 * threshold του oxc — κάθε νέα function εκεί σπάει το test transform.
 */
import { v4 as uuid } from 'uuid';
import { db } from './schema';
import { getCurrentUserId } from './session';
import type { CustomTracker } from './types';

const now = () => new Date().toISOString();

export async function listTrackers(includeArchived = false): Promise<CustomTracker[]> {
  const rows = await db.custom_trackers.where('user_id').equals(getCurrentUserId()).toArray();
  return rows
    .filter((t) => t.deleted_at == null && (includeArchived || !t.is_archived))
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
}

export async function getTracker(id: string): Promise<CustomTracker | undefined> {
  return db.custom_trackers.get(id);
}

export async function createTracker(name: string, unit: string | null = null): Promise<CustomTracker> {
  const t = now();
  const existing = await listTrackers(true);
  const tracker: CustomTracker = {
    id: uuid(),
    user_id: getCurrentUserId(),
    name: name.trim(),
    unit: unit?.trim() || null,
    display_order: existing.length,
    is_archived: false,
    created_at: t,
    updated_at: t,
    deleted_at: null,
  };
  await db.custom_trackers.add(tracker);
  return tracker;
}

/** Προσθέτει μια (προσημασμένη) καταχώρηση — append-only, ποτέ mutate scalar. */
export async function addTrackerEntry(trackerId: string, amount: number): Promise<void> {
  const t = now();
  await db.custom_tracker_entries.add({
    id: uuid(),
    user_id: getCurrentUserId(),
    tracker_id: trackerId,
    amount,
    logged_at: t,
    created_at: t,
    updated_at: t,
    deleted_at: null,
  });
}

/** Συνολικό άθροισμα ενός tracker (all-time) — για εμφάνιση/έλεγχο. */
export async function getTrackerTotal(trackerId: string): Promise<number> {
  const rows = await db.custom_tracker_entries.where('tracker_id').equals(trackerId).toArray();
  return rows.filter((e) => e.deleted_at == null).reduce((a, e) => a + e.amount, 0);
}
