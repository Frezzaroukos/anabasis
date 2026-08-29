/**
 * Sync engine — προαιρετικό cloud sync πάνω από το τοπικό Dexie.
 * Συμβόλαιο: server/API-CONTRACT.md. Row-level last-write-wins, server-
 * assigned μονότονο `seq` ανά account (όχι εμπιστοσύνη σε client clocks).
 *
 * Offline-first: ΚΑΘΕ αποτυχία δικτύου μένει σιωπηλή — ποτέ exception προς
 * το UI, μόνο `useSyncStatus()`. Το app δουλεύει πανομοιότυπα χωρίς σύνδεση.
 */

import { useSyncExternalStore } from 'react';
import type { Table } from 'dexie';
import { db } from '../db/schema';
import { getCurrentUserId } from '../db/session';
import { USER_DATA_TABLES } from '../db/queries';
import { api, readStoredAuth, ApiError, type SyncChange } from '../api/client';

const SYNC_STORAGE_KEY = 'anabasis.sync';
/** Επικάλυψη στο incremental push: καλύπτει clock skew/late writes γύρω από το προηγούμενο push. */
const PUSH_OVERLAP_MS = 5 * 60_000;
const AUTO_SYNC_INTERVAL_MS = 5 * 60_000;
const WRITE_DEBOUNCE_MS = 15_000;
const PULL_LIMIT = 1000;
/** Server όριο 5000 rows/request (413) — μένουμε με περιθώριο. */
const PUSH_BATCH_LIMIT = 2000;

interface SyncCursors {
  pullCursor: number;
  lastPushAt: string | null;
  lastSyncAt: string | null;
  /** Ταυτότητα της server βάσης — αν αλλάξει (restore/recreate), οι cursors μας δεν ισχύουν. */
  epoch: string | null;
}

const DEFAULT_CURSORS: SyncCursors = { pullCursor: 0, lastPushAt: null, lastSyncAt: null, epoch: null };

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readCursors(): SyncCursors {
  try {
    const raw = safeLocalStorage()?.getItem(SYNC_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CURSORS };
    return { ...DEFAULT_CURSORS, ...(JSON.parse(raw) as Partial<SyncCursors>) };
  } catch {
    return { ...DEFAULT_CURSORS };
  }
}

function writeCursors(patch: Partial<SyncCursors>): SyncCursors {
  const next = { ...readCursors(), ...patch };
  try {
    safeLocalStorage()?.setItem(SYNC_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

/* ─────────── Status store (useSyncExternalStore) ─────────── */

export type SyncStateValue = 'idle' | 'syncing' | 'error' | 'offline' | 'signed-out';

export interface SyncStatus {
  state: SyncStateValue;
  lastSyncAt: string | null;
}

let status: SyncStatus = { state: 'signed-out', lastSyncAt: readCursors().lastSyncAt };
const statusListeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  for (const l of statusListeners) l();
}

function subscribeStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function getStatusSnapshot(): SyncStatus {
  return status;
}

/** { state, lastSyncAt } — reactive, για την κάρτα λογαριασμού στις Ρυθμίσεις. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeStatus, getStatusSnapshot, getStatusSnapshot);
}

function isLoggedIn(): boolean {
  return readStoredAuth() != null;
}

/* ─────────── Push: ποιες γραμμές μου ανήκουν ─────────── */

type AnyTable = Table<Record<string, unknown>, string>;

function userDataTablesGeneric(): Record<string, AnyTable> {
  return USER_DATA_TABLES() as unknown as Record<string, AnyTable>;
}

/** Πίνακες με δικό τους `user_id` index — απλό `.where('user_id').equals(uid)`. */
const DIRECT_OWNER_TABLES = [
  'exercises', 'workouts', 'personal_records', 'skills',
  'user_skill_progress', 'user_skill_step_completions', 'app_settings',
  'body_metrics', 'programs', 'activities', 'goals',
] as const;

/**
 * `sets`, `skill_steps`, `program_exercises` δεν έχουν δικό τους `user_id`
 * στο τοπικό schema — ανήκουν μέσω workout_id/skill_id/program_id (ίδιο
 * μοτίβο με το `deleteProfile` στο queries.ts). Ο server όμως απαιτεί
 * `user_id` σε ΚΑΘΕ row· το προσθέτουμε μόνο στο payload που φεύγει,
 * υπολογισμένο από τον γονέα — ΔΕΝ γράφεται τοπικά.
 */
async function collectChildRows(uid: string, cutoffIso: string): Promise<SyncChange[]> {
  const out: SyncChange[] = [];

  const myWorkoutIds = new Set(
    (await db.workouts.where('user_id').equals(uid).toArray()).map((w) => w.id),
  );
  const sets = (await db.sets.toArray()).filter(
    (s) => myWorkoutIds.has(s.workout_id) && s.updated_at > cutoffIso,
  );
  if (sets.length) out.push({ tbl: 'sets', rows: sets.map((s) => ({ ...s, user_id: uid })) });

  const mySkillIds = new Set(
    (await db.skills.where('user_id').equals(uid).toArray()).map((s) => s.id),
  );
  const steps = (await db.skill_steps.toArray()).filter(
    (s) => mySkillIds.has(s.skill_id) && s.updated_at > cutoffIso,
  );
  if (steps.length) {
    out.push({ tbl: 'skill_steps', rows: steps.map((s) => ({ ...s, user_id: uid })) });
  }

  const myProgramIds = new Set(
    (await db.programs.where('user_id').equals(uid).toArray()).map((p) => p.id),
  );
  const programExercises = (await db.program_exercises.toArray()).filter(
    (pe) => myProgramIds.has(pe.program_id) && pe.updated_at > cutoffIso,
  );
  if (programExercises.length) {
    out.push({
      tbl: 'program_exercises',
      rows: programExercises.map((pe) => ({ ...pe, user_id: uid })),
    });
  }

  return out;
}

/** Όλα τα rows του τρέχοντος χρήστη με updated_at > cutoff, στα 15 tables. */
async function collectPushChanges(cutoffIso: string): Promise<SyncChange[]> {
  const uid = getCurrentUserId();
  const tables = userDataTablesGeneric();
  const changes: SyncChange[] = [];

  for (const name of DIRECT_OWNER_TABLES) {
    const rows = (await tables[name]!.where('user_id').equals(uid).toArray()).filter(
      (r) => (r.updated_at as string) > cutoffIso,
    );
    if (rows.length) changes.push({ tbl: name, rows });
  }

  // users: το PK είναι `id`, όχι `user_id` — μία μόνο γραμμή, το δικό μου προφίλ.
  // Ο server απαιτεί user_id σε ΚΑΘΕ row (wrong_user αλλιώς), οπότε το
  // εγχέουμε στο wire payload όπως και στα child tables.
  const me = await db.users.get(uid);
  if (me && me.updated_at > cutoffIso)
    changes.push({ tbl: 'users', rows: [{ ...me, user_id: me.id }] });

  changes.push(...(await collectChildRows(uid, cutoffIso)));

  return changes;
}

/** Σπάει σε αιτήματα ≤ PUSH_BATCH_LIMIT rows συνολικά (server: 5000/request, 413 αλλιώς). */
async function pushInBatches(changes: SyncChange[]): Promise<void> {
  let batch: SyncChange[] = [];
  let count = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    await api.syncPush({ changes: batch });
    batch = [];
    count = 0;
  };

  for (const change of changes) {
    let rows = change.rows;
    while (rows.length > 0) {
      const room = PUSH_BATCH_LIMIT - count;
      if (room <= 0) {
        await flush();
        continue;
      }
      const slice = rows.slice(0, room);
      batch.push({ tbl: change.tbl, rows: slice });
      count += slice.length;
      rows = rows.slice(slice.length);
    }
  }
  await flush();
}

/* ─────────── Pull ─────────── */

async function applyPulledChanges(changes: SyncChange[]): Promise<void> {
  const tables = userDataTablesGeneric();
  const touched = changes
    .map((c) => tables[c.tbl])
    .filter((t): t is AnyTable => t != null);
  if (touched.length === 0) return;

  await db.transaction('rw', touched, async () => {
    for (const { tbl, rows } of changes) {
      const table = tables[tbl];
      // Tombstones (deleted=1) περνάνε κανονικά — το payload κουβαλάει ήδη
      // deleted_at, ο τοπικός κώδικας διαβάζει soft-deletes παντού.
      if (!table || rows.length === 0) continue;
      await table.bulkPut(rows as Record<string, unknown>[]);
    }
  });
}

async function pullLoop(): Promise<void> {
  let cursor = readCursors().pullCursor;
  let hasMore = true;
  while (hasMore) {
    const res = await api.syncPull({ cursor, limit: PULL_LIMIT });

    /*
     * Epoch check: αν ο server έχει ΑΛΛΗ βάση από αυτήν που θυμόμαστε
     * (restore από backup ή recreate), ο cursor μας δείχνει σε ιστορία που
     * δεν υπάρχει — χωρίς αυτό, θα «τραβούσαμε στο κενό» σιωπηλά για πάντα.
     * Μηδενίζουμε, ξανασπρώχνουμε ΟΛΑ τα τοπικά (η συσκευή είναι πλέον η
     * πληρέστερη πηγή) και ξανακατεβάζουμε από την αρχή.
     */
    const stored = readCursors();
    if (stored.epoch !== null && stored.epoch !== res.epoch) {
      writeCursors({ epoch: res.epoch, pullCursor: 0, lastPushAt: null });
      const everything = await collectPushChanges('');
      if (everything.length > 0) await pushInBatches(everything);
      cursor = 0;
      hasMore = true;
      continue;
    }
    if (stored.epoch === null) writeCursors({ epoch: res.epoch });

    if (res.changes.length > 0) await applyPulledChanges(res.changes);
    cursor = res.cursor;
    hasMore = res.has_more;
    // Cursor προχωρά ΜΕΤΑ από κάθε επιτυχή batch — ένα crash στη μέση δεν
    // ξαναδιαβάζει από την αρχή.
    writeCursors({ pullCursor: cursor });
  }
}

/* ─────────── Ενορχήστρωση ─────────── */

function handleSyncError(err: unknown): void {
  if (err instanceof ApiError && err.status === 401) {
    // client.ts καθάρισε ήδη το localStorage['anabasis.auth'] — αντανακλούμε.
    setStatus({ state: 'signed-out' });
    return;
  }
  if (err instanceof ApiError) {
    setStatus({ state: 'error' });
    return;
  }
  // fetch reject (offline/DNS/CORS) — όχι σφάλμα χρήστη, απλά καμία σύνδεση.
  setStatus({ state: 'offline' });
}

let inFlight = false;

/** Κανονικός κύκλος: incremental push (5' overlap) + πλήρες pull-drain. */
export async function syncNow(): Promise<void> {
  if (!isLoggedIn()) {
    setStatus({ state: 'signed-out' });
    return;
  }
  if (inFlight) return;
  inFlight = true;
  setStatus({ state: 'syncing' });
  try {
    const cursors = readCursors();
    const t0 = new Date().toISOString();
    const cutoff = cursors.lastPushAt
      ? new Date(new Date(cursors.lastPushAt).getTime() - PUSH_OVERLAP_MS).toISOString()
      : '';

    const changes = await collectPushChanges(cutoff);
    if (changes.length > 0) await pushInBatches(changes);
    writeCursors({ lastPushAt: t0 });

    await pullLoop();

    const finishedAt = new Date().toISOString();
    writeCursors({ lastSyncAt: finishedAt });
    setStatus({ state: 'idle', lastSyncAt: finishedAt });
  } catch (err) {
    handleSyncError(err);
  } finally {
    inFlight = false;
  }
}

/**
 * Πλήρες sync — push ΟΛΩΝ (χωρίς cutoff) + pull από cursor 0. Καλείται ΜΙΑ
 * φορά, αμέσως μετά το bind ενός τοπικού προφίλ σε λογαριασμό (login/signup,
 * βλ. migrateProfileUserId στο queries.ts): ο server δεν έχει ξαναδεί αυτά τα
 * δεδομένα, και το pull πρέπει να φέρει ό,τι υπάρχει ήδη σε άλλες συσκευές.
 */
export async function fullResync(order: 'push-first' | 'pull-first' = 'push-first'): Promise<void> {
  if (!isLoggedIn()) {
    setStatus({ state: 'signed-out' });
    return;
  }
  inFlight = true;
  setStatus({ state: 'syncing' });
  try {
    /*
     * Σειρά: στο signup τα ΤΟΠΙΚΑ δεδομένα είναι η αλήθεια → push πρώτα.
     * Στο login από νέα συσκευή ισχύει το αντίθετο — αν έκανε push πρώτα,
     * τα default rows της άδειας συσκευής (users/app_settings) θα πατούσαν
     * με LWW πάνω στα ήδη συγχρονισμένα του λογαριασμού.
     */
    const t0 = new Date().toISOString();
    if (order === 'pull-first') {
      writeCursors({ pullCursor: 0 });
      await pullLoop();
    }
    const changes = await collectPushChanges('');
    if (changes.length > 0) await pushInBatches(changes);
    writeCursors({ lastPushAt: t0, pullCursor: order === 'pull-first' ? readCursors().pullCursor : 0 });

    await pullLoop();

    const finishedAt = new Date().toISOString();
    writeCursors({ lastSyncAt: finishedAt });
    setStatus({ state: 'idle', lastSyncAt: finishedAt });
  } catch (err) {
    handleSyncError(err);
  } finally {
    inFlight = false;
  }
}

/* ─────────── Auto-sync: boot / interval / debounce μετά από γράψιμο ─────────── */

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Ελαφρύ notifier — καλείται μετά από ΚΑΘΕ τοπικό γράψιμο (βλ. initAutoSync,
 * που το συνδέει σε Dexie hooks) και προγραμματίζει ένα sync σε 15". Έτσι δεν
 * χρειάζεται να αγγίξουμε καμία από τις δεκάδες write-συναρτήσεις queries.ts.
 */
export function notifyLocalWrite(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void syncNow();
  }, WRITE_DEBOUNCE_MS);
}

let autoSyncActive = false;

/** Καλείται μία φορά στο boot του app (βλ. App.tsx). Επιστρέφει teardown. */
export function initAutoSync(): () => void {
  if (autoSyncActive) return () => {};
  autoSyncActive = true;

  const tables = userDataTablesGeneric();
  const onWrite = () => notifyLocalWrite();
  for (const table of Object.values(tables)) {
    table.hook('creating', onWrite);
    table.hook('updating', onWrite);
    table.hook('deleting', onWrite);
  }

  if (isLoggedIn()) void syncNow();
  const interval = setInterval(() => void syncNow(), AUTO_SYNC_INTERVAL_MS);

  return () => {
    clearInterval(interval);
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const table of Object.values(tables)) {
      table.hook('creating').unsubscribe(onWrite);
      table.hook('updating').unsubscribe(onWrite);
      table.hook('deleting').unsubscribe(onWrite);
    }
    autoSyncActive = false;
  };
}
