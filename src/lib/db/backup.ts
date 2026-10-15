/**
 * Backup / restore — η ΜΟΝΗ γραμμή άμυνας ενός offline-first app χωρίς
 * υποχρεωτικό backend. Ζει ξεχωριστά από το `queries.ts` (που κάθεται στο όριο
 * του oxc parser) και re-exported από εκεί για συμβατότητα.
 *
 * Δύο διαδρομές εξαγωγής, με ΔΙΑΦΟΡΕΤΙΚΟ σκοπό — και το format το δηλώνει ρητά
 * στο `scope`, ώστε ούτε ο χρήστης ούτε το import να μπερδεύονται:
 *   - `exportProfile()` → ΜΟΝΟ το τρέχον προφίλ (η προεπιλογή του UI). Ό,τι
 *     δείχνει η σελίδα «Τα δεδομένα σου» είναι ακριβώς ό,τι φεύγει.
 *   - `exportAll()`     → ΟΛΑ τα προφίλ αυτής της συσκευής (πλήρης μετακόμιση).
 *
 * Το παλιό `exportAll` έβγαζε σιωπηλά ΚΑΙ τα άλλα προφίλ ενώ το UI έλεγε «your
 * data» — διαρροή ιδιωτικότητας σε κοινόχρηστη συσκευή (Codex audit §2).
 */
import { db } from './schema';
import { getCurrentUserId } from './session';
import { USER_DATA_TABLES } from './queries';

const now = () => new Date().toISOString();

/** Τρέχουσα έκδοση format. v1→8 πίνακες, v2→18 πίνακες, v3→+scope/profile_id. */
export const BACKUP_VERSION = 3;

export type BackupScope = 'profile' | 'device';

/**
 * Πλήρες JSON backup — ΟΛΗ η τοπική βάση, ΟΛΑ τα προφίλ μαζί. Αυτό είναι το
 * μονοπάτι «αντίγραφο/μετακόμιση συσκευής»: αν έχεις πολλά προφίλ, φεύγουν όλα
 * μαζί σε ένα αρχείο. Το UI πρέπει να το περιγράφει ρητά ως τέτοιο.
 */
export async function exportAll(): Promise<string> {
  const tables = USER_DATA_TABLES();
  const names = Object.keys(tables) as (keyof ReturnType<typeof USER_DATA_TABLES>)[];
  const arrays = await Promise.all(names.map((n) => tables[n].toArray()));
  const data = Object.fromEntries(names.map((n, i) => [n, arrays[i]]));
  return JSON.stringify(
    { format: 'anabasis-backup', version: BACKUP_VERSION, scope: 'device', exported_at: now(), data },
    null,
    2,
  );
}

/**
 * Backup ΜΟΝΟ του συγκεκριμένου προφίλ (default: του ενεργού). Τα builtin
 * (seeded) rows με `user_id === null` (exercises/skills/activities) ΔΕΝ μπαίνουν
 * — ξαναφυτεύονται από το bootstrap στην εισαγωγή, άρα δεν είναι δεδομένα του
 * χρήστη. Οι τέσσερις πίνακες χωρίς δικό τους `user_id` (`sets`, `skill_steps`,
 * `program_days`, `program_exercises`) μαζεύονται μέσω του γονέα τους — ΙΔΙΟ
 * μοτίβο ιδιοκτησίας με το `deleteProfile`/`migrateProfileUserId`.
 */
export async function exportProfile(userId: string = getCurrentUserId()): Promise<string> {
  const [
    users, exercises, workouts, personal_records, skills,
    user_skill_progress, user_skill_step_completions, app_settings,
    body_metrics, programs, activities, goals,
    custom_trackers, custom_tracker_entries,
  ] = await Promise.all([
    db.users.where('id').equals(userId).toArray(),
    db.exercises.where('user_id').equals(userId).toArray(),
    db.workouts.where('user_id').equals(userId).toArray(),
    db.personal_records.where('user_id').equals(userId).toArray(),
    db.skills.where('user_id').equals(userId).toArray(),
    db.user_skill_progress.where('user_id').equals(userId).toArray(),
    db.user_skill_step_completions.where('user_id').equals(userId).toArray(),
    db.app_settings.where('user_id').equals(userId).toArray(),
    db.body_metrics.where('user_id').equals(userId).toArray(),
    db.programs.where('user_id').equals(userId).toArray(),
    db.activities.where('user_id').equals(userId).toArray(),
    db.goals.where('user_id').equals(userId).toArray(),
    db.custom_trackers.where('user_id').equals(userId).toArray(),
    db.custom_tracker_entries.where('user_id').equals(userId).toArray(),
  ]);

  // Child tables: ανήκουν μέσω parent id, όχι μέσω δικού τους user_id.
  const workoutIds = new Set(workouts.map((w) => w.id));
  const skillIds = new Set(skills.map((s) => s.id));
  const programIds = new Set(programs.map((p) => p.id));
  const [allSets, allSkillSteps, allProgramDays, allProgramExercises] = await Promise.all([
    db.sets.toArray(),
    db.skill_steps.toArray(),
    db.program_days.toArray(),
    db.program_exercises.toArray(),
  ]);
  const sets = allSets.filter((s) => workoutIds.has(s.workout_id));
  const skill_steps = allSkillSteps.filter((s) => skillIds.has(s.skill_id));
  const program_days = allProgramDays.filter((d) => programIds.has(d.program_id));
  const program_exercises = allProgramExercises.filter((e) => programIds.has(e.program_id));

  const data = {
    users, exercises, workouts, sets, personal_records, skills, skill_steps,
    user_skill_progress, user_skill_step_completions, app_settings, body_metrics,
    programs, program_days, program_exercises, activities, goals,
    custom_trackers, custom_tracker_entries,
  };
  return JSON.stringify(
    {
      format: 'anabasis-backup',
      version: BACKUP_VERSION,
      scope: 'profile',
      profile_id: userId,
      exported_at: now(),
      data,
    },
    null,
    2,
  );
}

export interface ImportResult {
  ok: boolean;
  message: string;
  counts?: Record<string, number>;
  /** Πόσα rows αγνοήθηκαν επειδή η βάση είχε ΝΕΟΤΕΡΗ έκδοσή τους (LWW). */
  skipped?: number;
}

/** Στεγνή προεπισκόπηση του τι θα κάνει ένα import, χωρίς καμία εγγραφή. */
export interface ImportPreview {
  ok: boolean;
  /** error key όταν `ok === false` */
  message?: string;
  version?: number;
  scope?: BackupScope;
  /** νέα rows (δεν υπάρχουν τοπικά) */
  add: number;
  /** rows που θα ενημερωθούν (το αρχείο είναι νεότερο) */
  update: number;
  /** rows που θα κρατηθούν ως έχουν (η τοπική έκδοση είναι νεότερη/ίδια) */
  skip: number;
  perTable?: Record<string, { add: number; update: number; skip: number }>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function hasStringId(r: unknown): r is Row {
  return !!r && typeof r === 'object' && typeof (r as Row).id === 'string';
}

/**
 * Last-write-wins στο import: ένα εισερχόμενο row κερδίζει μόνο αν ΔΕΝ υπάρχει
 * τοπικά ή αν είναι γνήσια νεότερο (`updated_at` ως ISO string — lexicographic,
 * ίδια σύμβαση με τον server sync). Ισοπαλία ή παλιότερο → κρατάμε ό,τι υπάρχει.
 * Έτσι ένα παλιό backup ΔΕΝ πατάει σιωπηλά νεότερες αλλαγές (Codex audit §2).
 */
function incomingWins(incoming: Row, existing: Row | undefined): boolean {
  if (!existing) return true;
  const inc = typeof incoming.updated_at === 'string' ? incoming.updated_at : '';
  const ex = typeof existing.updated_at === 'string' ? existing.updated_at : '';
  return inc > ex;
}

interface ParsedBackup {
  format: string;
  version?: number;
  scope?: BackupScope;
  data: Record<string, unknown[]>;
}

type ParseOk = { ok: true; backup: ParsedBackup };
type ParseErr = { ok: false; error: string };

/** Κοινή επικύρωση για import + preview: format, data, και version gate. */
function parseBackup(json: string): ParseOk | ParseErr {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'invalidJson' };
  }
  const b = parsed as Partial<ParsedBackup>;
  if (b?.format !== 'anabasis-backup' || !b.data || typeof b.data !== 'object') {
    return { ok: false, error: 'notABackup' };
  }
  const version = typeof b.version === 'number' ? b.version : 1;
  // Δεν διαβάζουμε format νεότερο από αυτό που ξέρουμε — θα παρερμηνεύαμε πεδία.
  if (version > BACKUP_VERSION) {
    return { ok: false, error: 'backupTooNew' };
  }
  return { ok: true, backup: b as ParsedBackup };
}

/**
 * Αποφασίζει ποια rows γράφονται και ποια αγνοούνται (LWW) για έναν πίνακα.
 * Rows χωρίς έγκυρο `id` μπαίνουν σκόπιμα στο `toPut` ώστε το `bulkPut` να τα
 * απορρίψει και να κάνει rollback ΟΛΟ το import (atomic — καμία μισο-εγγραφή).
 */
async function decideRows(
  table: { bulkGet: (keys: unknown[]) => Promise<unknown[]> },
  rows: unknown[],
): Promise<{ toPut: Row[]; skipped: number }> {
  const withId = rows.filter(hasStringId);
  const withoutId = rows.filter((r) => !hasStringId(r)) as Row[];
  const existing = withId.length ? await table.bulkGet(withId.map((r) => r.id)) : [];
  const toPut: Row[] = [...withoutId];
  let skipped = 0;
  withId.forEach((row, i) => {
    if (incomingWins(row, existing[i] as Row | undefined)) toPut.push(row);
    else skipped++;
  });
  return { toPut, skipped };
}

/**
 * Προεπισκόπηση import — ΜΗΔΕΝ εγγραφές. Επιστρέφει πόσα θα προστεθούν, θα
 * ενημερωθούν και πόσα θα κρατηθούν (τοπική νεότερη έκδοση). Το UI το δείχνει
 * πριν ζητήσει επιβεβαίωση, ώστε κανένα overwrite να μην είναι σιωπηλό.
 */
export async function previewImport(json: string): Promise<ImportPreview> {
  const parsed = parseBackup(json);
  if (!parsed.ok) return { ok: false, message: parsed.error, add: 0, update: 0, skip: 0 };
  const b = parsed.backup;
  const tables = USER_DATA_TABLES();
  const perTable: Record<string, { add: number; update: number; skip: number }> = {};
  let add = 0;
  let update = 0;
  let skip = 0;
  try {
    for (const [name, table] of Object.entries(tables)) {
      const rows = b.data[name];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const withId = rows.filter(hasStringId);
      const existing = withId.length
        ? await (table as unknown as { bulkGet: (k: unknown[]) => Promise<unknown[]> }).bulkGet(
            withId.map((r) => r.id),
          )
        : [];
      let a = rows.length - withId.length; // rows χωρίς id → θα δοκιμαστούν ως νέα
      let u = 0;
      let s = 0;
      withId.forEach((row, i) => {
        const ex = existing[i] as Row | undefined;
        if (!ex) a++;
        else if (incomingWins(row, ex)) u++;
        else s++;
      });
      perTable[name] = { add: a, update: u, skip: s };
      add += a;
      update += u;
      skip += s;
    }
  } catch {
    return { ok: false, message: 'importFailed', add: 0, update: 0, skip: 0 };
  }
  return {
    ok: true,
    version: typeof b.version === 'number' ? b.version : 1,
    scope: b.scope,
    add,
    update,
    skip,
    perTable,
  };
}

/**
 * Επαναφορά από backup. Merge, όχι wipe: δεν σβήνει ό,τι δεν είναι στο αρχείο.
 * Δέχεται v1/v2/v3 (παλιά keys αγνοούνται)· απορρίπτει format νεότερο από το
 * γνωστό. Εφαρμόζει LWW ανά row ώστε ένα παλιό backup να ΜΗΝ πατά νεότερα rows
 * (Codex audit §2). Όλο το import σε ΜΙΑ transaction: ή όλα ή τίποτα.
 */
export async function importAll(json: string): Promise<ImportResult> {
  const parsed = parseBackup(json);
  if (!parsed.ok) return { ok: false, message: parsed.error };
  const b = parsed.backup;

  const tables = USER_DATA_TABLES();
  const counts: Record<string, number> = {};
  let skippedTotal = 0;
  try {
    await db.transaction('rw', Object.values(tables), async () => {
      for (const [name, table] of Object.entries(tables)) {
        const rows = b.data[name];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        const { toPut, skipped } = await decideRows(
          table as unknown as { bulkGet: (k: unknown[]) => Promise<unknown[]> },
          rows,
        );
        if (toPut.length) await (table as unknown as { bulkPut: (r: Row[]) => Promise<unknown> }).bulkPut(toPut);
        counts[name] = toPut.length;
        skippedTotal += skipped;
      }
    });
  } catch {
    return { ok: false, message: 'importFailed' };
  }
  return { ok: true, message: 'imported', counts, skipped: skippedTotal };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
