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
}

/**
 * Επαναφορά από backup. Κάνει merge (bulkPut) — δεν σβήνει ό,τι δεν είναι στο
 * αρχείο, ώστε μια λάθος επαναφορά να μην καταστρέφει δεδομένα.
 * Δέχεται και v1 αρχεία (λιγότεροι πίνακες — άγνωστα keys απλώς αγνοούνται).
 * Όλο το import τρέχει σε ΜΙΑ transaction: ή μπαίνουν όλα ή τίποτα —
 * ένα σκάρτο row στη μέση δεν αφήνει τη βάση μισο-γραμμένη.
 */
export async function importAll(json: string): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, message: 'invalidJson' };
  }
  const b = parsed as { format?: string; data?: Record<string, unknown[]> };
  if (b?.format !== 'anabasis-backup' || !b.data) {
    return { ok: false, message: 'notABackup' };
  }

  const tables = USER_DATA_TABLES();
  const counts: Record<string, number> = {};
  try {
    await db.transaction('rw', Object.values(tables), async () => {
      for (const [name, table] of Object.entries(tables)) {
        const rows = b.data![name];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (table as any).bulkPut(rows);
        counts[name] = rows.length;
      }
    });
  } catch {
    return { ok: false, message: 'importFailed' };
  }
  return { ok: true, message: 'imported', counts };
}
