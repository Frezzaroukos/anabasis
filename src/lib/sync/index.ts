/**
 * Sync layer — Supabase Pro tier (stub).
 *
 * v1 ships with offline-only Dexie. This stub exists so consumers
 * can `import { sync }` without conditional code. Replace the body
 * once Supabase + auth lands.
 */

export interface SyncStatus {
  enabled: boolean;
  lastSyncedAt: string | null;
  pending: number;
}

export const sync = {
  status(): SyncStatus {
    return { enabled: false, lastSyncedAt: null, pending: 0 };
  },
  async push(): Promise<void> {
    /* no-op until Pro tier ships */
  },
  async pull(): Promise<void> {
    /* no-op until Pro tier ships */
  },
};
