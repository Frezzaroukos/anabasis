/**
 * DB query helpers for the workout flow.
 * Components MUST go through this module — never call db.* directly.
 *
 * All writes stamp updated_at and respect soft-delete semantics
 * (deleted_at instead of physical removal).
 */

import { v4 as uuid } from 'uuid';
import { db } from './schema';
import { LOCAL_USER_ID } from './bootstrap';
import { candidatesFromSet, isNewPR } from '../domain/pr';
import type {
  AppSettings,
  Exercise,
  PersonalRecord,
  SetEntry,
  UserSkillProgress,
  UserSkillStepCompletion,
  Workout,
} from './types';

const now = () => new Date().toISOString();

/* ─────────── Workouts ─────────── */

export async function startWorkout(): Promise<Workout> {
  const t = now();
  const w: Workout = {
    id: uuid(),
    user_id: LOCAL_USER_ID,
    started_at: t,
    ended_at: null,
    duration_seconds: null,
    notes: null,
    workout_type: null,
    feel: null,
    created_at: t,
    updated_at: t,
    deleted_at: null,
  };
  await db.workouts.add(w);
  return w;
}

export async function endWorkout(workoutId: string): Promise<void> {
  const t = now();
  const w = await db.workouts.get(workoutId);
  if (!w) return;
  const startedMs = Date.parse(w.started_at);
  const endedMs = Date.parse(t);
  const duration = Math.max(0, Math.round((endedMs - startedMs) / 1000));
  await db.workouts.update(workoutId, {
    ended_at: t,
    duration_seconds: duration,
    updated_at: t,
  });
}

export async function setWorkoutType(
  workoutId: string,
  workoutType: string | null,
): Promise<void> {
  await db.workouts.update(workoutId, {
    workout_type: workoutType,
    updated_at: now(),
  });
}

export async function softDeleteWorkout(workoutId: string): Promise<void> {
  const t = now();
  await db.workouts.update(workoutId, { deleted_at: t, updated_at: t });
}

export async function getActiveWorkout(): Promise<Workout | undefined> {
  // "Active" = not ended yet, not soft-deleted, owned by local user
  const candidates = await db.workouts
    .where('user_id')
    .equals(LOCAL_USER_ID)
    .toArray();
  return candidates
    .filter((w) => w.ended_at == null && w.deleted_at == null)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
}

/* ─────────── Sets ─────────── */

export interface AddSetInput {
  workout_id: string;
  exercise_id: string;
  weight_kg: number | null;
  bodyweight_kg: number | null;
  reps: number | null;
  hold_seconds: number | null;
  is_warmup?: boolean;
  is_failure?: boolean;
  notes?: string | null;
}

export async function addSet(input: AddSetInput): Promise<SetEntry> {
  const t = now();
  const existingForExercise = await db.sets
    .where('workout_id')
    .equals(input.workout_id)
    .and((s) => s.exercise_id === input.exercise_id && s.deleted_at == null)
    .count();

  const set: SetEntry = {
    id: uuid(),
    workout_id: input.workout_id,
    exercise_id: input.exercise_id,
    set_number: existingForExercise + 1,
    weight_kg: input.weight_kg,
    bodyweight_kg: input.bodyweight_kg,
    reps: input.reps,
    hold_seconds: input.hold_seconds,
    rpe: null,
    is_warmup: input.is_warmup ?? false,
    is_failure: input.is_failure ?? false,
    notes: input.notes ?? null,
    rest_seconds: null,
    created_at: t,
    updated_at: t,
    deleted_at: null,
  };
  await db.sets.add(set);
  // Warm-ups δεν μετράνε για PR — αλλιώς κάθε ζέσταμα θα «έσπαγε» ρεκόρ.
  if (!set.is_warmup) await detectPRs(set, input.workout_id);
  return set;
}

/**
 * Ελέγχει κάθε PR-υποψηφιότητα του σετ έναντι του τρέχοντος ρεκόρ και
 * αποθηκεύει ό,τι είναι νέο. Καλείται αυτόματα από το addSet.
 */
async function detectPRs(set: SetEntry, workoutId: string): Promise<void> {
  const t = now();
  const candidates = candidatesFromSet(set);
  if (candidates.length === 0) return;

  const existing = await db.personal_records
    .where('user_id')
    .equals(LOCAL_USER_ID)
    .filter((r) => r.exercise_id === set.exercise_id)
    .toArray();

  for (const c of candidates) {
    const current = existing.find((r) => r.type === c.type) ?? null;
    if (!isNewPR(c, current)) continue;
    await db.personal_records.add({
      id: uuid(),
      user_id: LOCAL_USER_ID,
      exercise_id: set.exercise_id,
      type: c.type,
      value: c.value,
      reps: c.reps,
      weight_kg: c.weight_kg,
      achieved_at: t,
      workout_id: workoutId,
      set_id: set.id,
      created_at: t,
      updated_at: t,
    });
  }
}

/** PRs ανά άσκηση — για το UI (exercise_id → PersonalRecord[]). */
export async function getPRsByExercise(): Promise<Map<string, PersonalRecord[]>> {
  const rows = await db.personal_records
    .where('user_id')
    .equals(LOCAL_USER_ID)
    .toArray();
  const m = new Map<string, PersonalRecord[]>();
  for (const r of rows) {
    const arr = m.get(r.exercise_id) ?? [];
    arr.push(r);
    m.set(r.exercise_id, arr);
  }
  return m;
}

/** Τα πιο πρόσφατα PRs, ταξινομημένα (για History/Dashboard). */
export async function getRecentPRs(limit = 20): Promise<PersonalRecord[]> {
  const rows = await db.personal_records
    .where('user_id')
    .equals(LOCAL_USER_ID)
    .toArray();
  return rows
    .sort((a, b) => b.achieved_at.localeCompare(a.achieved_at))
    .slice(0, limit);
}

export async function updateSet(
  setId: string,
  patch: Partial<Pick<SetEntry, 'weight_kg' | 'reps' | 'hold_seconds' | 'notes'>>,
): Promise<void> {
  await db.sets.update(setId, { ...patch, updated_at: now() });
}

export async function softDeleteSet(setId: string): Promise<void> {
  const t = now();
  await db.sets.update(setId, { deleted_at: t, updated_at: t });
}

/* ─────────── Exercises ─────────── */

export async function listExercises(): Promise<Exercise[]> {
  const all = await db.exercises.toArray();
  return all
    .filter((e) => e.deleted_at == null && !e.is_archived)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ─────────── Skills (the progression tree) ─────────── */

/** Ένα skill μαζί με τα βήματά του, ταξινομημένα. */
export async function getSkillWithSteps(skillId: string) {
  const [skill, steps] = await Promise.all([
    db.skills.get(skillId),
    db.skill_steps.where('skill_id').equals(skillId).sortBy('step_number'),
  ]);
  return skill ? { skill, steps } : null;
}

/** Τα ολοκληρωμένα βήματα του χρήστη για ένα skill (step_id → completion). */
export async function getStepCompletions(
  stepIds: string[],
): Promise<Map<string, UserSkillStepCompletion>> {
  if (stepIds.length === 0) return new Map();
  const rows = await db.user_skill_step_completions
    .where('user_id')
    .equals(LOCAL_USER_ID)
    .toArray();
  const wanted = new Set(stepIds);
  return new Map(
    rows.filter((r) => wanted.has(r.skill_step_id)).map((r) => [r.skill_step_id, r]),
  );
}

export async function getSkillProgress(
  skillId: string,
): Promise<UserSkillProgress | undefined> {
  return db.user_skill_progress
    .where('[user_id+skill_id]')
    .equals([LOCAL_USER_ID, skillId])
    .first();
}

/** Πρόοδος για ΟΛΑ τα skills — για τη λίστα (skill_id → progress). */
export async function getAllSkillProgress(): Promise<Map<string, UserSkillProgress>> {
  const rows = await db.user_skill_progress
    .where('user_id')
    .equals(LOCAL_USER_ID)
    .toArray();
  return new Map(rows.map((r) => [r.skill_id, r]));
}

async function upsertProgress(
  skillId: string,
  patch: Partial<UserSkillProgress>,
): Promise<void> {
  const t = now();
  const existing = await getSkillProgress(skillId);
  if (existing) {
    await db.user_skill_progress.update(existing.id, { ...patch, updated_at: t });
    return;
  }
  await db.user_skill_progress.add({
    id: uuid(),
    user_id: LOCAL_USER_ID,
    skill_id: skillId,
    current_step_id: null,
    status: 'in_progress',
    started_at: t,
    mastered_at: null,
    notes: null,
    created_at: t,
    updated_at: t,
    ...patch,
  });
}

/**
 * Μαρκάρει ένα βήμα ως πετυχημένο και προωθεί το skill στο επόμενο.
 * Αν ήταν το τελευταίο βήμα → mastered.
 */
export async function achieveStep(
  skillId: string,
  stepId: string,
  achievedValue: number,
): Promise<void> {
  const t = now();
  const steps = await db.skill_steps.where('skill_id').equals(skillId).sortBy('step_number');
  const idx = steps.findIndex((s) => s.id === stepId);
  if (idx === -1) return;

  const already = await db.user_skill_step_completions
    .where('user_id')
    .equals(LOCAL_USER_ID)
    .filter((r) => r.skill_step_id === stepId)
    .first();

  if (!already) {
    await db.user_skill_step_completions.add({
      id: uuid(),
      user_id: LOCAL_USER_ID,
      skill_step_id: stepId,
      achieved_value: achievedValue,
      achieved_at: t,
      workout_id: null,
      notes: null,
      created_at: t,
    });
  }

  const next = steps[idx + 1];
  await upsertProgress(skillId, {
    current_step_id: next ? next.id : stepId,
    status: next ? 'in_progress' : 'mastered',
    mastered_at: next ? null : t,
  });
}

/** Αναίρεση — χρήσιμο όταν μαρκάρεις κατά λάθος. */
export async function undoStep(skillId: string, stepId: string): Promise<void> {
  const rows = await db.user_skill_step_completions
    .where('user_id')
    .equals(LOCAL_USER_ID)
    .filter((r) => r.skill_step_id === stepId)
    .toArray();
  await Promise.all(rows.map((r) => db.user_skill_step_completions.delete(r.id)));
  await upsertProgress(skillId, {
    current_step_id: stepId,
    status: 'in_progress',
    mastered_at: null,
  });
}

/* ─────────── Data ownership (export / import) ─────────── */

/** Πλήρες JSON backup. Local-first σημαίνει: τα δεδομένα φεύγουν όποτε θες. */
export async function exportAll(): Promise<string> {
  const [
    users, exercises, workouts, sets, personal_records,
    user_skill_progress, user_skill_step_completions, app_settings,
  ] = await Promise.all([
    db.users.toArray(), db.exercises.toArray(), db.workouts.toArray(),
    db.sets.toArray(), db.personal_records.toArray(),
    db.user_skill_progress.toArray(), db.user_skill_step_completions.toArray(),
    db.app_settings.toArray(),
  ]);
  return JSON.stringify(
    {
      format: 'anabasis-backup',
      version: 1,
      exported_at: now(),
      data: {
        users, exercises, workouts, sets, personal_records,
        user_skill_progress, user_skill_step_completions, app_settings,
      },
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
 * Τα seeded skills/skill_steps δεν εισάγονται (τα ορίζει η έκδοση της εφαρμογής).
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

  const tables = {
    users: db.users, exercises: db.exercises, workouts: db.workouts,
    sets: db.sets, personal_records: db.personal_records,
    user_skill_progress: db.user_skill_progress,
    user_skill_step_completions: db.user_skill_step_completions,
    app_settings: db.app_settings,
  } as const;

  const counts: Record<string, number> = {};
  for (const [name, table] of Object.entries(tables)) {
    const rows = b.data[name];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (table as any).bulkPut(rows);
    counts[name] = rows.length;
  }
  return { ok: true, message: 'imported', counts };
}

/* ─────────── Settings ─────────── */

export async function updateSettings(
  patch: Partial<AppSettings>,
): Promise<void> {
  const s = await db.app_settings.where('user_id').equals(LOCAL_USER_ID).first();
  const t = now();
  if (s) {
    await db.app_settings.update(s.id, { ...patch, updated_at: t });
  }
}
