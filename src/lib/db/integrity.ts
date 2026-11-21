/**
 * Έλεγχος/επιδιόρθωση ακεραιότητας — orphan rows που δημιουργούνται όταν ένας
 * γονέας φύγει χωρίς cascade (hard delete από παλιό κώδικα, restore από
 * backup που έλειπε πίνακας, sync που έφερε παιδί πριν τον γονέα).
 *
 * Ο έλεγχος είναι ΜΟΝΟ ΑΝΑΓΝΩΣΗ. Η επιδιόρθωση είναι ρητή ενέργεια του
 * χρήστη και αγγίζει μόνο rows που δεν φαίνονται πουθενά στην εφαρμογή:
 *  - παιδιά με λείποντα/σβησμένο γονέα → soft delete (tombstone, sync-safe),
 *  - personal_records χωρίς προπόνηση → οριστική διαγραφή (παράγωγα, χωρίς
 *    deleted_at στο schema),
 *  - skill_steps χωρίς skill → οριστική διαγραφή (δεν έχουν deleted_at).
 */
import { db } from './schema';

export type IntegrityCode =
  | 'setsWithoutWorkout'
  | 'setsOfDeletedWorkout'
  | 'prsWithoutWorkout'
  | 'skillStepsWithoutSkill'
  | 'programDaysWithoutProgram'
  | 'programDaysOfDeletedProgram'
  | 'programExercisesWithoutProgram'
  | 'programExercisesWithoutDay'
  | 'trackerEntriesWithoutTracker'
  | 'trackerEntriesOfDeletedTracker';

export interface IntegrityIssue {
  code: IntegrityCode;
  /** Πίνακας που έχει το πρόβλημα — για διαγνωστικό report. */
  table: string;
  count: number;
}

export interface IntegrityReport {
  ok: boolean;
  checkedAt: string;
  total: number;
  issues: IntegrityIssue[];
}

interface FoundIssue {
  code: IntegrityCode;
  table: string;
  ids: string[];
}

const now = () => new Date().toISOString();

async function analyze(): Promise<FoundIssue[]> {
  const [workouts, sets, prs, skills, skillSteps, programs, programDays, programExercises, trackers, trackerEntries] =
    await Promise.all([
      db.workouts.toArray(),
      db.sets.toArray(),
      db.personal_records.toArray(),
      db.skills.toArray(),
      db.skill_steps.toArray(),
      db.programs.toArray(),
      db.program_days.toArray(),
      db.program_exercises.toArray(),
      db.custom_trackers.toArray(),
      db.custom_tracker_entries.toArray(),
    ]);

  const workoutById = new Map(workouts.map((w) => [w.id, w]));
  const skillIds = new Set(skills.map((s) => s.id));
  const programById = new Map(programs.map((p) => [p.id, p]));
  const dayById = new Map(programDays.map((d) => [d.id, d]));
  const trackerById = new Map(trackers.map((t) => [t.id, t]));

  const found: FoundIssue[] = [];
  const push = (code: IntegrityCode, table: string, ids: string[]) => {
    if (ids.length > 0) found.push({ code, table, ids });
  };

  push(
    'setsWithoutWorkout',
    'sets',
    sets
      .filter((s) => s.deleted_at == null && !workoutById.has(s.workout_id))
      .map((s) => s.id),
  );
  push(
    'setsOfDeletedWorkout',
    'sets',
    sets
      .filter((s) => {
        if (s.deleted_at != null) return false;
        const parent = workoutById.get(s.workout_id);
        return parent != null && parent.deleted_at != null;
      })
      .map((s) => s.id),
  );
  push(
    'prsWithoutWorkout',
    'personal_records',
    prs
      .filter((r) => {
        const parent = workoutById.get(r.workout_id);
        return parent == null || parent.deleted_at != null;
      })
      .map((r) => r.id),
  );
  push(
    'skillStepsWithoutSkill',
    'skill_steps',
    skillSteps.filter((s) => !skillIds.has(s.skill_id)).map((s) => s.id),
  );
  push(
    'programDaysWithoutProgram',
    'program_days',
    programDays
      .filter((d) => d.deleted_at == null && !programById.has(d.program_id))
      .map((d) => d.id),
  );
  push(
    'programDaysOfDeletedProgram',
    'program_days',
    programDays
      .filter((d) => {
        if (d.deleted_at != null) return false;
        const parent = programById.get(d.program_id);
        return parent != null && parent.deleted_at != null;
      })
      .map((d) => d.id),
  );
  push(
    'programExercisesWithoutProgram',
    'program_exercises',
    programExercises
      .filter((r) => {
        if (r.deleted_at != null) return false;
        const parent = programById.get(r.program_id);
        return parent == null || parent.deleted_at != null;
      })
      .map((r) => r.id),
  );
  push(
    'programExercisesWithoutDay',
    'program_exercises',
    programExercises
      .filter((r) => {
        if (r.deleted_at != null || r.program_day_id == null) return false;
        if (!programById.has(r.program_id)) return false; // καλύπτεται από το πάνω
        const day = dayById.get(r.program_day_id);
        return day == null || day.deleted_at != null;
      })
      .map((r) => r.id),
  );
  push(
    'trackerEntriesWithoutTracker',
    'custom_tracker_entries',
    trackerEntries
      .filter((e) => e.deleted_at == null && !trackerById.has(e.tracker_id))
      .map((e) => e.id),
  );
  push(
    'trackerEntriesOfDeletedTracker',
    'custom_tracker_entries',
    trackerEntries
      .filter((e) => {
        if (e.deleted_at != null) return false;
        const parent = trackerById.get(e.tracker_id);
        return parent != null && parent.deleted_at != null;
      })
      .map((e) => e.id),
  );

  return found;
}

export async function checkDataIntegrity(): Promise<IntegrityReport> {
  const found = await analyze();
  const issues: IntegrityIssue[] = found.map((f) => ({
    code: f.code,
    table: f.table,
    count: f.ids.length,
  }));
  const total = issues.reduce((n, i) => n + i.count, 0);
  return { ok: total === 0, checkedAt: now(), total, issues };
}

export interface RepairResult {
  repaired: Partial<Record<IntegrityCode, number>>;
  total: number;
}

export async function repairDataIntegrity(): Promise<RepairResult> {
  const found = await analyze();
  const t = now();
  const repaired: Partial<Record<IntegrityCode, number>> = {};
  const soft = () => ({ deleted_at: t, updated_at: t });

  await db.transaction(
    'rw',
    [
      db.sets,
      db.personal_records,
      db.skill_steps,
      db.program_days,
      db.program_exercises,
      db.custom_tracker_entries,
    ],
    async () => {
      for (const issue of found) {
        const ids = issue.ids;
        if (ids.length === 0) continue;
        switch (issue.code) {
          case 'setsWithoutWorkout':
          case 'setsOfDeletedWorkout':
            repaired[issue.code] =
              (repaired[issue.code] ?? 0) + (await db.sets.where('id').anyOf(ids).modify(soft()));
            break;
          case 'prsWithoutWorkout':
            repaired[issue.code] =
              (repaired[issue.code] ?? 0) +
              (await db.personal_records.where('id').anyOf(ids).delete());
            break;
          case 'skillStepsWithoutSkill':
            repaired[issue.code] =
              (repaired[issue.code] ?? 0) +
              (await db.skill_steps.where('id').anyOf(ids).delete());
            break;
          case 'programDaysWithoutProgram':
          case 'programDaysOfDeletedProgram':
            repaired[issue.code] =
              (repaired[issue.code] ?? 0) +
              (await db.program_days.where('id').anyOf(ids).modify(soft()));
            break;
          case 'programExercisesWithoutProgram':
          case 'programExercisesWithoutDay':
            repaired[issue.code] =
              (repaired[issue.code] ?? 0) +
              (await db.program_exercises.where('id').anyOf(ids).modify(soft()));
            break;
          case 'trackerEntriesWithoutTracker':
          case 'trackerEntriesOfDeletedTracker':
            repaired[issue.code] =
              (repaired[issue.code] ?? 0) +
              (await db.custom_tracker_entries.where('id').anyOf(ids).modify(soft()));
            break;
        }
      }
    },
  );

  const total = Object.values(repaired).reduce((a, b) => a + b, 0);
  return { repaired, total };
}
