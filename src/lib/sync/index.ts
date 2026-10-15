/**
 * Sync engine — προαιρετικό cloud sync πάνω από το τοπικό Dexie.
 * Συμβόλαιο: server/API-CONTRACT.md. Row-level last-write-wins πάνω στο client
 * `updated_at` (δες incomingWins). Ο server-assigned μονότονος `seq` ανά account
 * είναι ΜΟΝΟ για το cursor ordering του pull — όχι για την επίλυση συγκρούσεων.
 * Το skew καλύπτεται από bounded forward-skew clamp στον server (ό,τι είναι
 * μπροστά από το ρολόι του κόβεται στο now)· δεν είναι πλήρες HLC — δύο ρολόγια
 * εντός ορίων λύνονται με ωμή σύγκριση updated_at.
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
  /** Ποια έκδοση του push-set έχει ήδη σταλεί από ΑΥΤΗ τη συσκευή. */
  pushSchemaVersion: number;
}

/**
 * Αυξήσου όταν ΠΡΟΣΤΙΘΕΤΑΙ πίνακας στο push set.
 *
 * Το κανονικό push στέλνει μόνο ό,τι έχει `updated_at > cutoff`. Ένας πίνακας
 * που μόλις μπήκε στο sync έχει ΥΠΑΡΧΟΥΣΕΣ γραμμές με παλιό `updated_at` — δεν
 * θα περνούσαν ποτέ το cutoff και το χαρακτηριστικό θα δούλευε μόνο για ό,τι
 * φτιάχνεις από δω και πέρα. Η αλλαγή της έκδοσης κάνει ΜΙΑ φορά push χωρίς
 * cutoff, ώστε τα ήδη υπάρχοντα να προλάβουν.
 *
 * 1 = προστέθηκαν τα `program_days` (η δομή πολλαπλών ημερών).
 */
const PUSH_SCHEMA_VERSION = 1;

const DEFAULT_CURSORS: SyncCursors = {
  pullCursor: 0,
  lastPushAt: null,
  lastSyncAt: null,
  epoch: null,
  pushSchemaVersion: 0,
};

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
  'custom_trackers', 'custom_tracker_entries',
] as const;

/**
 * `sets`, `skill_steps`, `program_days`, `program_exercises` δεν έχουν δικό
 * τους `user_id` στο τοπικό schema — ανήκουν μέσω
 * workout_id/skill_id/program_id (ίδιο μοτίβο με το `deleteProfile` στο
 * queries.ts). Ο server όμως απαιτεί `user_id` σε ΚΑΘΕ row (αλλιώς
 * `wrong_user`)· το προσθέτουμε μόνο στο payload που φεύγει, υπολογισμένο από
 * τον γονέα — ΔΕΝ γράφεται τοπικά.
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

  /*
   * Οι ΜΕΡΕΣ έλειπαν από το sync ενώ οι ασκήσεις τους έφευγαν κανονικά. Σε
   * δεύτερη συσκευή έφταναν program_exercises με `program_day_id` που έδειχνε
   * σε μέρα που δεν υπήρχε: το `listProgramDays()` γύριζε [], το πρόγραμμα
   * έμοιαζε flat, και το «ξεκίνα ολόκληρο» ισοπέδωνε όλες τις μέρες σε μία
   * λίστα. Στέλνονται πριν από τις ασκήσεις τους — δεν υπάρχει FK, αλλά η
   * σειρά γονιός→παιδί κρατά το payload διαβάσιμο.
   */
  const programDays = (await db.program_days.toArray()).filter(
    (d) => myProgramIds.has(d.program_id) && d.updated_at > cutoffIso,
  );
  if (programDays.length) {
    out.push({ tbl: 'program_days', rows: programDays.map((d) => ({ ...d, user_id: uid })) });
  }

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

type SyncRow = Record<string, unknown>;

/*
 * Τρεις πίνακες έχουν ΔΕΥΤΕΡΕΥΟΝ unique index πέρα από το PK (schema.ts):
 * app_settings &user_id, user_skill_progress &[user_id+skill_id],
 * body_metrics &[user_id+date]. Κάθε συσκευή φτιάχνει το δικό της
 * app_settings με ΤΥΧΑΙΟ id (bootstrap) και μετά το login το δένει στο ίδιο
 * user_id — άρα δύο συσκευές = δύο rows, ίδιο user_id, άλλο id. Ένα τυφλό
 * bulkPut του ξένου row έσπαγε το unique index (ConstraintError) κι ΟΛΟ το
 * pull transaction αποτύγχανε για πάντα → ο cursor δεν προχωρούσε ποτέ →
 * μόνιμο κόλλημα του sync και στις δύο συσκευές. Λύση: ντετερμινιστικός
 * νικητής (νεότερο updated_at· ισοπαλία → μικρότερο id λεξικογραφικά) — ίδιος
 * σε ΚΑΘΕ συσκευή, άρα συγκλίνουν στο ίδιο row χωρίς να σπάει ο index.
 */
const UNIQUE_DUP_FINDER: Record<
  string,
  (t: AnyTable, r: SyncRow) => Promise<SyncRow | undefined>
> = {
  app_settings: (t, r) => t.where('user_id').equals(r.user_id as string).first(),
  user_skill_progress: (t, r) =>
    t.where('[user_id+skill_id]').equals([r.user_id, r.skill_id] as [string, string]).first(),
  body_metrics: (t, r) =>
    t.where('[user_id+date]').equals([r.user_id, r.date] as [string, string]).first(),
};

function incomingWins(incoming: SyncRow, existing: SyncRow): boolean {
  // Parse timestamps to milliseconds; invalid/empty dates become 0.
  const iTime = new Date(String(incoming.updated_at ?? '')).getTime() || 0;
  const eTime = new Date(String(existing.updated_at ?? '')).getTime() || 0;
  // Compare numeric timestamps; if equal, use id as stable tiebreaker.
  if (iTime !== eTime) return iTime > eTime;
  return String(incoming.id) < String(existing.id);
}

async function putResolvingUnique(
  table: AnyTable,
  rows: SyncRow[],
  findDup: (t: AnyTable, r: SyncRow) => Promise<SyncRow | undefined>,
): Promise<void> {
  for (const incoming of rows) {
    const existing = await findDup(table, incoming);
    if (existing && existing.id !== incoming.id) {
      // Διαφορετικό id, ίδιο unique key: κράτα μόνο τον νικητή.
      if (incomingWins(incoming, existing)) {
        await table.delete(existing.id as string);
        await table.put(incoming);
      }
      // αλλιώς ο τοπικός νικά — μην γράψεις το incoming (θα έσπαγε τον index).
    } else {
      await table.put(incoming);
    }
  }
}

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
      // Παλιότεροι clients δεν στέλνουν το v17 additive πεδίο. Το Dexie δεν
      // εφαρμόζει migration σε rows που φτάνουν αργότερα από sync, άρα το
      // κανονικοποιούμε στο pull boundary για forward/backward compatibility.
      const compatibleRows =
        tbl === 'sets'
          ? (rows as SyncRow[]).map((row) => ({
              ...row,
              rest_pause_reps: row.rest_pause_reps ?? [],
            }))
          : (rows as SyncRow[]);
      const findDup = UNIQUE_DUP_FINDER[tbl];
      if (findDup) {
        await putResolvingUnique(table, compatibleRows as SyncRow[], findDup);
      } else {
        await table.bulkPut(compatibleRows as SyncRow[]);
      }
    }
  });
}

/* ─────────── Destructive reset (gc_floor) ─────────── */

/** Πίνακες-παιδιά (χωρίς δικό τους `user_id`) — το wire payload θέλει user_id. */
const CHILD_WIRE_TABLES = new Set(['sets', 'skill_steps', 'program_days', 'program_exercises']);

/** Προσθέτει `user_id` στο payload όπου ο server το απαιτεί (παιδιά + users),
 * ίδιο μοτίβο με το collectPushChanges — ΔΕΝ γράφεται τοπικά. */
function toWireRow(tbl: string, row: SyncRow, uid: string): SyncRow {
  return tbl === 'users' || CHILD_WIRE_TABLES.has(tbl) ? { ...row, user_id: uid } : row;
}

/**
 * ΩΜΑ τοπικά rows του χρήστη, ανά πίνακα, ΧΩΡΙΣ injection — στιγμιότυπο πριν το
 * reset snapshot τα γράψει από πάνω. Ιδιοκτησία: direct-owner μέσω `user_id`,
 * users μέσω PK, παιδιά μέσω γονέα (ίδιο μοτίβο με collectPushChanges).
 */
async function collectOwnedLocalRaw(uid: string): Promise<SyncChange[]> {
  const out: SyncChange[] = [];
  const tables = userDataTablesGeneric();

  for (const name of DIRECT_OWNER_TABLES) {
    const rows = await tables[name]!.where('user_id').equals(uid).toArray();
    if (rows.length) out.push({ tbl: name, rows });
  }

  const me = await db.users.get(uid);
  if (me) out.push({ tbl: 'users', rows: [me] });

  const myWorkoutIds = new Set(
    (await db.workouts.where('user_id').equals(uid).toArray()).map((w) => w.id),
  );
  const sets = (await db.sets.toArray()).filter((s) => myWorkoutIds.has(s.workout_id));
  if (sets.length) out.push({ tbl: 'sets', rows: sets });

  const mySkillIds = new Set(
    (await db.skills.where('user_id').equals(uid).toArray()).map((s) => s.id),
  );
  const steps = (await db.skill_steps.toArray()).filter((s) => mySkillIds.has(s.skill_id));
  if (steps.length) out.push({ tbl: 'skill_steps', rows: steps });

  const myProgramIds = new Set(
    (await db.programs.where('user_id').equals(uid).toArray()).map((p) => p.id),
  );
  const pdays = (await db.program_days.toArray()).filter((d) => myProgramIds.has(d.program_id));
  if (pdays.length) out.push({ tbl: 'program_days', rows: pdays });
  const pex = (await db.program_exercises.toArray()).filter((pe) =>
    myProgramIds.has(pe.program_id),
  );
  if (pex.length) out.push({ tbl: 'program_exercises', rows: pex });

  return out;
}

/** tbl → (row id → updated_at του snapshot). Για να ξέρουμε τι υπάρχει ΖΩΝΤΑΝΟ
 * στον server και αν η τοπική μας έκδοση είναι νεότερη. */
type SnapVersions = Map<string, Map<string, string>>;

/** Κατεβάζει ΟΛΟ το ζωντανό snapshot από cursor 0, το εφαρμόζει τοπικά και
 * επιστρέφει τις server versions. (cursor-0 pull δεν flag-άρει ποτέ reset.) */
async function drainSnapshotFromZero(): Promise<SnapVersions> {
  const snap: SnapVersions = new Map();
  writeCursors({ pullCursor: 0 });
  let cursor = 0;
  let hasMore = true;
  while (hasMore) {
    const res = await api.syncPull({ cursor, limit: PULL_LIMIT });
    if (readCursors().epoch === null) writeCursors({ epoch: res.epoch });
    for (const { tbl, rows } of res.changes) {
      let m = snap.get(tbl);
      if (!m) {
        m = new Map();
        snap.set(tbl, m);
      }
      for (const r of rows as SyncRow[]) m.set(String(r.id), String(r.updated_at ?? ''));
    }
    if (res.changes.length > 0) await applyPulledChanges(res.changes);
    cursor = res.cursor;
    hasMore = res.has_more;
    writeCursors({ pullCursor: cursor });
  }
  return snap;
}

/**
 * Σωστό destructive reset όταν ο server επιστρέφει `reset_required` (ο cursor
 * μας είναι πίσω από το gc_floor). Το απλό «μηδένισε cursor + ξαναπέρνα» άφηνε
 * δύο προβλήματα: (α) το applyPulledChanges κάνει bulkPut, άρα τοπικά rows που
 * ΛΕΙΠΟΥΝ από το ζωντανό snapshot (σβησμένα οριστικά αλλού, «φαντάσματα»)
 * έμεναν για πάντα στο IndexedDB· (β) ένα edited ghost μπορούσε να ξανασπρωχτεί
 * και να αναστήσει σβησμένη γραμμή.
 *
 * Εδώ: (1) κράτα στιγμιότυπο των τοπικών ΠΡΙΝ γραφτούν από πάνω, (2) κατέβασε
 * όλο το ζωντανό snapshot ως πηγή αλήθειας, (3) σβήσε τα synced ghosts που
 * λείπουν από το snapshot, (4) σπρώξε ΜΟΝΟ γνήσια νέα/νεότερα, μη-tombstoned
 * rows. «Γνήσια νέα» = έγινε μετά το τελευταίο push (updated_at > boundary) και
 * λείπει από τον server· ένα μη-edited ghost (παλιό, synced) σβήνεται, δεν
 * σπρώχνεται — δεν ανασταίνει διαγραφή.
 *
 * Όριο (ειλικρινές): ένα edited ghost (alive, updated_at > boundary, GC-αρισμένο
 * στον server) είναι τοπικά αδιάκριτο από μια γνήσια νέα γραμμή, οπότε σπρώχνεται
 * — πλήρης αποτροπή θέλει server-side gc_floor απόρριψη στο push (εκτός scope).
 */
async function destructiveReset(): Promise<void> {
  const uid = getCurrentUserId();
  const boundary = readCursors().lastPushAt ?? '';
  const localBefore = await collectOwnedLocalRaw(uid);
  const snap = await drainSnapshotFromZero();

  const tables = userDataTablesGeneric();
  // Πίνακες ταυτότητας/συσκευής που ΔΕΝ σβήνονται ποτέ ως ghost (ο χρήστης και
  // οι ρυθμίσεις της συσκευής ζουν τοπικά· η απουσία τους από snapshot δεν είναι
  // «διαγραφή»).
  const NEVER_PURGE = new Set(['users', 'app_settings']);
  const survivors: SyncChange[] = [];

  for (const { tbl, rows } of localBefore) {
    const table = tables[tbl];
    if (!table) continue;
    const serverVer = snap.get(tbl);
    const toDelete: string[] = [];
    const toPush: SyncRow[] = [];

    for (const raw of rows as SyncRow[]) {
      const id = String(raw.id);
      const upd = String(raw.updated_at ?? '');
      const tombstoned = raw.deleted === 1 || raw.deleted_at != null;
      const sv = serverVer?.get(id);

      if (sv === undefined) {
        if (!tombstoned && upd > boundary) {
          // Γνήσια νέα τοπική γραμμή (ο server δεν την έχει) → κράτα & σπρώξε.
          toPush.push(toWireRow(tbl, raw, uid));
        } else if (!NEVER_PURGE.has(tbl)) {
          // Ghost (παλιό synced row GC-αρισμένο) ή stale tombstone → σβήσε, ΜΗ σπρώξεις.
          toDelete.push(id);
        }
      } else if (!tombstoned && upd > sv) {
        // Υπάρχει στον server· το bulkPut έγραψε τη server έκδοση. Το τοπικό edit
        // είναι νεότερο → επανάφερέ το τοπικά και σπρώξ' το (LWW).
        await table.put(raw as Record<string, unknown>);
        toPush.push(toWireRow(tbl, raw, uid));
      }
    }

    if (toDelete.length) await table.bulkDelete(toDelete);
    if (toPush.length) survivors.push({ tbl, rows: toPush });
  }

  if (survivors.length) await pushInBatches(survivors);
}

async function pullLoop(): Promise<void> {
  let cursor = readCursors().pullCursor;
  let hasMore = true;
  while (hasMore) {
    const res = await api.syncPull({ cursor, limit: PULL_LIMIT });

    /*
     * gc_floor reset (Codex §3): ο server μας λέει ότι ο cursor μας είναι πίσω
     * από το σημείο όπου κράτησε διαγραφές — μπορεί να χάσαμε tombstones που
     * σβήστηκαν οριστικά. Το σχόλιο στο types.ts το λέει destructive (wipe +
     * pull από 0): το κάνει το `destructiveReset()`, που ΟΝΤΩΣ σβήνει τα τοπικά
     * «φαντάσματα» που λείπουν από το ζωντανό snapshot (το παλιό μηδένιζε μόνο
     * τον cursor και άφηνε τα ghosts στο IndexedDB) και ξανασπρώχνει ΜΟΝΟ γνήσια
     * νέα/νεότερα, μη-tombstoned rows — ποτέ σβησμένα. Επιστρέφουμε αμέσως μετά:
     * ο κύκλος pull ολοκληρώθηκε από το reset.
     */
    if (res.reset_required) {
      await destructiveReset();
      return;
    }

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

let running = false;
let syncChain: Promise<void> = Promise.resolve();

/*
 * Ένας μόνο κύκλος sync τη φορά — και σε σειρά. Χωρίς αυτό, ένα login
 * (fullResync) μπορούσε να τρέξει ΤΑΥΤΟΧΡΟΝΑ με ένα auto-sync (syncNow): και τα
 * δύο έγραφαν cursors και το `finally` του ενός καθάριζε το guard του άλλου →
 * χαμένα/διπλά rows. Τα coalesce ticks (περιοδικό/debounce) απλώς παραλείπονται
 * όσο τρέχει κάτι· το login ΠΟΤΕ δεν παραλείπεται — μπαίνει στην ουρά.
 */
async function runExclusive(
  work: () => Promise<void>,
  opts: { coalesce: boolean },
): Promise<void> {
  if (opts.coalesce && running) return;
  const prev = syncChain;
  let release!: () => void;
  syncChain = new Promise<void>((r) => {
    release = r;
  });
  await prev;
  running = true;
  try {
    await work();
  } finally {
    running = false;
    release();
  }
}

/** Κανονικός κύκλος: incremental push (5' overlap) + πλήρες pull-drain. */
export async function syncNow(): Promise<void> {
  if (!isLoggedIn()) {
    setStatus({ state: 'signed-out' });
    return;
  }
  return runExclusive(syncNowInner, { coalesce: true });
}

async function syncNowInner(): Promise<void> {
  setStatus({ state: 'syncing' });
  try {
    const cursors = readCursors();
    const t0 = new Date().toISOString();
    // Backfill: νέος πίνακας στο push set → μία φορά χωρίς cutoff.
    const needsBackfill = cursors.pushSchemaVersion !== PUSH_SCHEMA_VERSION;
    const cutoff =
      !needsBackfill && cursors.lastPushAt
        ? new Date(new Date(cursors.lastPushAt).getTime() - PUSH_OVERLAP_MS).toISOString()
        : '';

    const changes = await collectPushChanges(cutoff);
    if (changes.length > 0) await pushInBatches(changes);
    // Η έκδοση γράφεται ΜΟΝΟ μετά από επιτυχημένο push — αλλιώς ένα αποτυχημένο
    // backfill θα θεωρούνταν ολοκληρωμένο και τα παλιά rows δεν θα έφευγαν ποτέ.
    writeCursors({ lastPushAt: t0, pushSchemaVersion: PUSH_SCHEMA_VERSION });

    await pullLoop();

    const finishedAt = new Date().toISOString();
    writeCursors({ lastSyncAt: finishedAt });
    setStatus({ state: 'idle', lastSyncAt: finishedAt });
  } catch (err) {
    handleSyncError(err);
  }
}

/**
 * Logout flush: σπρώχνει ό,τι δεν έχει συγχρονιστεί ΠΡΙΝ το logout σβήσει τα
 * τοπικά δεδομένα. Χωρίς αυτό, τοπικές αλλαγές που δεν πρόλαβαν να φύγουν
 * χάνονταν οριστικά στο purge (ο server δεν τις είχε ποτέ). Καλείται ενώ το
 * token είναι ΑΚΟΜΑ έγκυρο (πριν το api.logout()).
 *
 * Επιστρέφει πόσες αλλαγές ΕΜΕΙΝΑΝ ασυγχρόνιστες: 0 = τίποτα εκκρεμές ή όλα
 * έφτασαν στον server (ασφαλές να σβήσεις)· >0 = δεν έφτασαν (offline/σφάλμα)
 * και ο caller αποφασίζει (προειδοποίηση + επιλογή «logout ούτως ή άλλως»).
 */
export async function flushUnsynced(): Promise<number> {
  if (!isLoggedIn()) return 0;
  const cursors = readCursors();
  const needsBackfill = cursors.pushSchemaVersion !== PUSH_SCHEMA_VERSION;
  const cutoff =
    !needsBackfill && cursors.lastPushAt
      ? new Date(new Date(cursors.lastPushAt).getTime() - PUSH_OVERLAP_MS).toISOString()
      : '';
  const changes = await collectPushChanges(cutoff);
  const pending = changes.reduce((n, c) => n + c.rows.length, 0);
  if (pending === 0) return 0;
  try {
    const t0 = new Date().toISOString();
    await pushInBatches(changes);
    // Γράφεται ΜΟΝΟ μετά από επιτυχημένο push (ίδια σύμβαση με syncNowInner).
    writeCursors({ lastPushAt: t0, pushSchemaVersion: PUSH_SCHEMA_VERSION });
    return 0;
  } catch {
    // Δίκτυο κάτω / σφάλμα: δεν έφτασαν — ο caller προειδοποιεί.
    return pending;
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
  return runExclusive(() => fullResyncInner(order), { coalesce: false });
}

async function fullResyncInner(order: 'push-first' | 'pull-first'): Promise<void> {
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
