/**
 * DB query helpers for the workout flow.
 * Components MUST go through this module — never call db.* directly.
 *
 * All writes stamp updated_at and respect soft-delete semantics
 * (deleted_at instead of physical removal).
 */

import { v4 as uuid } from 'uuid';
import { db, SCHEMA_VERSION } from './schema';
import { getCurrentUserId } from './session';
import { candidatesFromSet, isNewPR } from '../domain/pr';
import { setVolume } from '../domain/volume';
import { e1rm } from '../domain/e1rm';
import { BUILTIN_EXERCISE_CATEGORIES } from './types';
import type {
  Activity,
  ActivityKind,
  AppSettings,
  DefaultUnit,
  ExerciseCategory,
  MovementType,
  Skill,
  SkillCategory,
  SkillStep,
  SkillTargetType,
  BodyMetric,
  Program,
  ProgramExercise,
  Exercise,
  PersonalRecord,
  SetEntry,
  SetType,
  User,
  UserSkillProgress,
  UserSkillStepCompletion,
  Workout,
} from './types';

const now = () => new Date().toISOString();

/**
 * Ορατό σε αυτό το προφίλ: τα seeded (`user_id === null`, κοινά σε όλους)
 * και ό,τι έφτιαξε το ίδιο το προφίλ. Χωρίς αυτό, οι δικές σου ασκήσεις
 * θα εμφανίζονταν στο προφίλ του διπλανού.
 */
function isVisibleToMe(row: { user_id: string | null }): boolean {
  return row.user_id === null || row.user_id === getCurrentUserId();
}


/* ─────────── Workouts ─────────── */

export async function startWorkout(
  activityKind: ActivityKind = 'strength',
): Promise<Workout> {
  const t = now();
  const w: Workout = {
    id: uuid(),
    user_id: getCurrentUserId(),
    started_at: t,
    ended_at: null,
    duration_seconds: null,
    notes: null,
    workout_type: null,
    activity_kind: activityKind,
    distance_km: null,
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
    .equals(getCurrentUserId())
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
  /** dropset/superset/rest-pause… default 'normal' (ή 'warmup' αν is_warmup) */
  set_type?: SetType;
  /** κοινό id για superset/dropset αλυσίδες */
  group_id?: string | null;
  notes?: string | null;
  /** v5: ένταση — 1-10 */
  rpe?: number | null;
  /** v5: επαναλήψεις που έμειναν */
  rir?: number | null;
  /** v5: ρυθμός εκτέλεσης, π.χ. "3-1-1-0" */
  tempo?: string | null;
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
    rpe: input.rpe ?? null,
    rir: input.rir ?? null,
    tempo: input.tempo ?? null,
    is_warmup: input.is_warmup ?? false,
    is_failure: input.is_failure ?? false,
    set_type:
      input.set_type ??
      (input.is_warmup ? 'warmup' : input.is_failure ? 'failure' : 'normal'),
    group_id: input.group_id ?? null,
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
    .equals(getCurrentUserId())
    .filter((r) => r.exercise_id === set.exercise_id)
    .toArray();

  for (const c of candidates) {
    const current = existing.find((r) => r.type === c.type) ?? null;
    if (!isNewPR(c, current)) continue;
    await db.personal_records.add({
      id: uuid(),
      user_id: getCurrentUserId(),
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
    .equals(getCurrentUserId())
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
    .equals(getCurrentUserId())
    .toArray();
  return rows
    .sort((a, b) => b.achieved_at.localeCompare(a.achieved_at))
    .slice(0, limit);
}

export async function updateSet(
  setId: string,
  patch: Partial<
    Pick<
      SetEntry,
      'weight_kg' | 'reps' | 'hold_seconds' | 'notes' | 'rpe' | 'rir' | 'tempo'
    >
  >,
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
    .filter((e) => isVisibleToMe(e) && e.deleted_at == null && !e.is_archived)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ─────────── Skills (the progression tree) ─────────── */

/**
 * Τα skills που βλέπει αυτό το προφίλ: τα seeded (κοινά) + τα δικά του.
 * Το component ΔΕΝ πρέπει να χτυπάει το `db.skills` απευθείας — αλλιώς
 * παρακάμπτει αυτό ακριβώς το φίλτρο.
 */
export async function listSkills(includeArchived = false): Promise<Skill[]> {
  const all = await db.skills.orderBy('display_order').toArray();
  return all.filter((s) => isVisibleToMe(s) && (includeArchived || !s.is_archived));
}

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
    .equals(getCurrentUserId())
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
    .equals([getCurrentUserId(), skillId])
    .first();
}

/** Πρόοδος για ΟΛΑ τα skills — για τη λίστα (skill_id → progress). */
export async function getAllSkillProgress(): Promise<Map<string, UserSkillProgress>> {
  const rows = await db.user_skill_progress
    .where('user_id')
    .equals(getCurrentUserId())
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
    user_id: getCurrentUserId(),
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
    .equals(getCurrentUserId())
    .filter((r) => r.skill_step_id === stepId)
    .first();

  if (!already) {
    await db.user_skill_step_completions.add({
      id: uuid(),
      user_id: getCurrentUserId(),
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
    .equals(getCurrentUserId())
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
  const s = await db.app_settings.where('user_id').equals(getCurrentUserId()).first();
  const t = now();
  if (s) {
    await db.app_settings.update(s.id, { ...patch, updated_at: t });
  }
}

/* ─────────── Progress analytics (charts) ─────────── */

export interface VolumePoint {
  /** ISO ημερομηνία (YYYY-MM-DD) */
  date: string;
  volume: number;
  sets: number;
}

/**
 * Όγκος προπόνησης ανά ημέρα για τις τελευταίες N ημέρες.
 * Οι κενές ημέρες συμπληρώνονται με 0 — αλλιώς το chart ψεύδεται
 * δείχνοντας συνεχή γραμμή πάνω από μέρες που δεν προπονήθηκες.
 */
export async function getVolumeTrend(days = 30): Promise<VolumePoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);
  // ΠΡΟΣΟΧΗ: toISOString() δίνει UTC. Σε UTC+3 τα τοπικά μεσάνυχτα πέφτουν
  // στην προηγούμενη UTC ημέρα → τα keys μετατοπίζονταν κατά μία μέρα και ο
  // όγκος εμφανιζόταν 0. Χρησιμοποιούμε ΤΟΠΙΚΗ ημερομηνία και για τα δύο.
  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;

  const workouts = (
    await db.workouts.where('user_id').equals(getCurrentUserId()).toArray()
  ).filter((w) => w.deleted_at == null && Date.parse(w.started_at) >= since.getTime());

  const byId = new Map(workouts.map((w) => [w.id, dayKey(new Date(w.started_at))]));
  const sets = (await db.sets.toArray()).filter(
    (s) => s.deleted_at == null && !s.is_warmup && byId.has(s.workout_id),
  );

  const acc = new Map<string, { volume: number; sets: number }>();
  for (const s of sets) {
    const day = byId.get(s.workout_id)!;
    const cur = acc.get(day) ?? { volume: 0, sets: 0 };
    cur.volume += setVolume(s);
    cur.sets += 1;
    acc.set(day, cur);
  }

  const out: VolumePoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const key = dayKey(d);
    const v = acc.get(key);
    out.push({ date: key, volume: Math.round(v?.volume ?? 0), sets: v?.sets ?? 0 });
  }
  return out;
}

/** Σύνοψη για το header του History. */
export async function getTrainingSummary(days = 30) {
  const trend = await getVolumeTrend(days);
  const active = trend.filter((p) => p.sets > 0);
  return {
    totalVolume: trend.reduce((a, p) => a + p.volume, 0),
    totalSets: trend.reduce((a, p) => a + p.sets, 0),
    activeDays: active.length,
    days,
  };
}

/* ─────────── Body metrics (βάρος / θερμίδες) ─────────── */

/** Τοπική ημερομηνία YYYY-MM-DD — μία εγγραφή ανά μέρα. */
export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Upsert μέτρησης ημέρας — γράφεις μόνο ό,τι θέλεις, τα υπόλοιπα μένουν. */
export async function saveBodyMetric(
  date: string,
  patch: Partial<Omit<BodyMetric, 'id' | 'user_id' | 'date' | 'created_at' | 'updated_at'>>,
): Promise<void> {
  const t = now();
  const existing = await db.body_metrics
    .where('[user_id+date]')
    .equals([getCurrentUserId(), date])
    .first();
  if (existing) {
    await db.body_metrics.update(existing.id, { ...patch, updated_at: t });
    return;
  }
  await db.body_metrics.add({
    id: uuid(),
    user_id: getCurrentUserId(),
    date,
    weight_kg: null,
    calories_in: null,
    calories_out: null,
    protein_g: null,
    body_fat_pct: null,
    notes: null,
    created_at: t,
    updated_at: t,
    ...patch,
  });
}

export async function getBodyMetric(date: string): Promise<BodyMetric | undefined> {
  return db.body_metrics.where('[user_id+date]').equals([getCurrentUserId(), date]).first();
}

export interface BodyPoint {
  date: string;
  weight: number | null;
  caloriesIn: number | null;
  caloriesOut: number | null;
  /** θετικό = πλεόνασμα, αρνητικό = έλλειμμα */
  balance: number | null;
  proteinG: number | null;
  bodyFatPct: number | null;
}

/**
 * Χρονοσειρά βάρους, θερμίδων & σύστασης σώματος. Οι τιμές αφήνονται `null`
 * στις μέρες χωρίς καταγραφή (το chart τις γεφυρώνει) — δεν εφευρίσκουμε τιμές.
 */
export async function getBodyTrend(days = 60): Promise<BodyPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const rows = await db.body_metrics.where('user_id').equals(getCurrentUserId()).toArray();
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: BodyPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const key = localDay(d);
    const r = byDate.get(key);
    const cin = r?.calories_in ?? null;
    const cout = r?.calories_out ?? null;
    out.push({
      date: key,
      weight: r?.weight_kg ?? null,
      caloriesIn: cin,
      caloriesOut: cout,
      balance: cin != null && cout != null ? cin - cout : null,
      proteinG: r?.protein_g ?? null,
      bodyFatPct: r?.body_fat_pct ?? null,
    });
  }
  return out;
}

/* ─────────── Per-exercise progress ─────────── */

export interface ExercisePoint {
  date: string;
  topWeight: number | null;
  e1rm: number | null;
  volume: number;
  reps: number | null;
}

/**
 * Πρόοδος σε ΜΙΑ άσκηση: καλύτερο σετ ανά ημέρα προπόνησης.
 * Μόνο ημέρες με δεδομένα (όχι gap-fill) — για μια άσκηση, τα κενά είναι
 * φυσιολογικά και μια συνεχής γραμμή είναι πιο ευανάγνωστη.
 */
export async function getExerciseProgress(
  exerciseId: string,
  days = 180,
): Promise<ExercisePoint[]> {
  const since = Date.now() - days * 86400_000;
  const workouts = await db.workouts.where('user_id').equals(getCurrentUserId()).toArray();
  const wDay = new Map(
    workouts
      .filter((w) => w.deleted_at == null && Date.parse(w.started_at) >= since)
      .map((w) => [w.id, localDay(new Date(w.started_at))]),
  );
  const sets = (
    await db.sets.where('exercise_id').equals(exerciseId).toArray()
  ).filter((s) => s.deleted_at == null && s.set_type !== 'warmup' && wDay.has(s.workout_id));

  const byDay = new Map<string, ExercisePoint>();
  for (const s of sets) {
    const day = wDay.get(s.workout_id)!;
    const cur =
      byDay.get(day) ??
      ({ date: day, topWeight: null, e1rm: null, volume: 0, reps: null } as ExercisePoint);
    const load = (s.weight_kg ?? 0) + (s.bodyweight_kg ?? 0);
    if (load > 0 && (cur.topWeight == null || load > cur.topWeight)) {
      cur.topWeight = load;
      cur.reps = s.reps;
    }
    if (s.reps && load > 0) {
      const est = e1rm(load, s.reps);
      if (cur.e1rm == null || est > cur.e1rm) cur.e1rm = Math.round(est * 10) / 10;
    }
    cur.volume += setVolume(s);
    byDay.set(day, cur);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/* ─────────── Calendar ─────────── */

export interface DayActivities {
  date: string;
  workouts: Array<{
    id: string;
    kind: ActivityKind;
    label: string | null;
    durationSeconds: number | null;
    distanceKm: number | null;
    sets: number;
  }>;
  weight: number | null;
}

/**
 * Ημερολόγιο: ΟΛΕΣ οι δραστηριότητες κάθε μέρας. Πολλές την ίδια μέρα είναι
 * κανονικό (γυμναστήριο + μπάσκετ + τρέξιμο), γι' αυτό επιστρέφουμε λίστα.
 */
export async function getCalendar(from: string, to: string): Promise<Map<string, DayActivities>> {
  const [workouts, allSets, metrics] = await Promise.all([
    db.workouts.where('user_id').equals(getCurrentUserId()).toArray(),
    db.sets.toArray(),
    db.body_metrics.where('user_id').equals(getCurrentUserId()).toArray(),
  ]);
  const setCount = new Map<string, number>();
  for (const s of allSets) {
    if (s.deleted_at != null) continue;
    setCount.set(s.workout_id, (setCount.get(s.workout_id) ?? 0) + 1);
  }
  const weightBy = new Map(metrics.map((m) => [m.date, m.weight_kg]));

  const out = new Map<string, DayActivities>();
  for (const w of workouts) {
    if (w.deleted_at != null) continue;
    const day = localDay(new Date(w.started_at));
    if (day < from || day > to) continue;
    const entry =
      out.get(day) ?? { date: day, workouts: [], weight: weightBy.get(day) ?? null };
    entry.workouts.push({
      id: w.id,
      kind: w.activity_kind ?? 'strength',
      label: w.workout_type,
      durationSeconds: w.duration_seconds,
      distanceKm: w.distance_km,
      sets: setCount.get(w.id) ?? 0,
    });
    out.set(day, entry);
  }
  // μέρες με ζύγισμα αλλά χωρίς προπόνηση — φαίνονται κι αυτές
  for (const m of metrics) {
    if (m.date < from || m.date > to || out.has(m.date)) continue;
    if (m.weight_kg == null && m.calories_in == null) continue;
    out.set(m.date, { date: m.date, workouts: [], weight: m.weight_kg });
  }
  return out;
}

/* ─────────── Programs / routines ─────────── */

export async function listPrograms(): Promise<Program[]> {
  const rows = await db.programs.where('user_id').equals(getCurrentUserId()).toArray();
  return rows
    .filter((p) => p.deleted_at == null && !p.is_archived)
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
}

export async function createProgram(
  name: string,
  activityKind: ActivityKind = 'strength',
): Promise<Program> {
  const t = now();
  const count = await db.programs.where('user_id').equals(getCurrentUserId()).count();
  const p: Program = {
    id: uuid(),
    user_id: getCurrentUserId(),
    name,
    description: null,
    activity_kind: activityKind,
    display_order: count,
    is_archived: false,
    created_at: t,
    updated_at: t,
    deleted_at: null,
  };
  await db.programs.add(p);
  return p;
}

export async function renameProgram(id: string, name: string): Promise<void> {
  await db.programs.update(id, { name, updated_at: now() });
}

export async function softDeleteProgram(id: string): Promise<void> {
  const t = now();
  await db.programs.update(id, { deleted_at: t, updated_at: t });
}

export async function getProgramWithExercises(programId: string) {
  const [program, rows] = await Promise.all([
    db.programs.get(programId),
    db.program_exercises.where('program_id').equals(programId).sortBy('position'),
  ]);
  return program ? { program, exercises: rows } : null;
}

export interface ProgramExerciseInput {
  exercise_id: string;
  target_sets?: number | null;
  target_reps?: number | null;
  target_weight_kg?: number | null;
  target_hold_seconds?: number | null;
  set_type?: SetType;
  group_key?: string | null;
  notes?: string | null;
}

export async function addProgramExercise(
  programId: string,
  input: ProgramExerciseInput,
): Promise<ProgramExercise> {
  const t = now();
  const position = await db.program_exercises
    .where('program_id')
    .equals(programId)
    .count();
  const row: ProgramExercise = {
    id: uuid(),
    program_id: programId,
    exercise_id: input.exercise_id,
    position,
    target_sets: input.target_sets ?? null,
    target_reps: input.target_reps ?? null,
    target_weight_kg: input.target_weight_kg ?? null,
    target_hold_seconds: input.target_hold_seconds ?? null,
    set_type: input.set_type ?? 'normal',
    group_key: input.group_key ?? null,
    notes: input.notes ?? null,
    created_at: t,
    updated_at: t,
  };
  await db.program_exercises.add(row);
  return row;
}

export async function updateProgramExercise(
  id: string,
  patch: Partial<Omit<ProgramExercise, 'id' | 'program_id' | 'created_at'>>,
): Promise<void> {
  await db.program_exercises.update(id, { ...patch, updated_at: now() });
}

export async function removeProgramExercise(id: string): Promise<void> {
  await db.program_exercises.delete(id);
}

/** Αλλαγή σειράς — γράφει ξανά τα positions ώστε να μένουν 0..n-1. */
export async function reorderProgramExercises(orderedIds: string[]): Promise<void> {
  const t = now();
  await Promise.all(
    orderedIds.map((id, i) =>
      db.program_exercises.update(id, { position: i, updated_at: t }),
    ),
  );
}

/**
 * Ξεκινά workout από πρόγραμμα. ΔΕΝ γράφει σετ — ένα σετ σημαίνει «το έκανα».
 * Το πλάνο επιστρέφεται ώστε ο logger να δείξει τους στόχους προς εκτέλεση.
 */
export async function startWorkoutFromProgram(programId: string) {
  const data = await getProgramWithExercises(programId);
  if (!data) return null;
  const w = await startWorkout(data.program.activity_kind);
  await db.workouts.update(w.id, {
    workout_type: data.program.name,
    updated_at: now(),
  });
  return { workout: { ...w, workout_type: data.program.name }, plan: data.exercises };
}

/** Αντιγράφει την τελευταία προπόνηση ως πρόγραμμα — «κάνε ό,τι έκανα τότε». */
export async function programFromLastWorkout(name: string): Promise<Program | null> {
  const done = (
    await db.workouts.where('user_id').equals(getCurrentUserId()).toArray()
  )
    .filter((w) => w.ended_at != null && w.deleted_at == null)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  const last = done[0];
  if (!last) return null;

  const sets = (await db.sets.where('workout_id').equals(last.id).toArray()).filter(
    (s) => s.deleted_at == null && s.set_type !== 'warmup',
  );
  if (sets.length === 0) return null;

  const prog = await createProgram(name, last.activity_kind ?? 'strength');
  // ομαδοποίηση ανά άσκηση: πλήθος σετ + το βαρύτερο ως στόχος
  const byExercise = new Map<string, { count: number; weight: number | null; reps: number | null; hold: number | null; setType: SetType }>();
  for (const s of sets) {
    const cur = byExercise.get(s.exercise_id) ?? {
      count: 0, weight: null, reps: null, hold: null, setType: s.set_type,
    };
    cur.count += 1;
    const load = s.weight_kg ?? null;
    if (load != null && (cur.weight == null || load > cur.weight)) {
      cur.weight = load;
      cur.reps = s.reps;
    }
    if (s.hold_seconds != null && (cur.hold == null || s.hold_seconds > cur.hold)) {
      cur.hold = s.hold_seconds;
    }
    byExercise.set(s.exercise_id, cur);
  }
  for (const [exercise_id, v] of byExercise) {
    await addProgramExercise(prog.id, {
      exercise_id,
      target_sets: v.count,
      target_reps: v.reps,
      target_weight_kg: v.weight,
      target_hold_seconds: v.hold,
      set_type: v.setType,
    });
  }
  return prog;
}

/** Απόσταση για run/cycling/swim — γράφεται στο workout, όχι σε σετ. */
export async function updateWorkoutDistance(
  workoutId: string,
  km: number | null,
): Promise<void> {
  await db.workouts.update(workoutId, { distance_km: km, updated_at: now() });
}

/** Σημειώσεις & αίσθηση συνεδρίας — χρήσιμα σε non-strength δραστηριότητες. */
export async function updateWorkoutMeta(
  workoutId: string,
  patch: Partial<Pick<Workout, 'notes' | 'feel' | 'workout_type'>>,
): Promise<void> {
  await db.workouts.update(workoutId, { ...patch, updated_at: now() });
}

/* ─────────── Δικές σου ασκήσεις (v5) ─────────── */

export interface ExerciseInput {
  name: string;
  category?: ExerciseCategory;
  movement_type?: MovementType;
  equipment?: string[];
  is_weighted?: boolean;
  is_bodyweight?: boolean;
  default_unit?: DefaultUnit;
  notes?: string | null;
}

/**
 * Φτιάχνει δική σου άσκηση. Η κατηγορία είναι ελεύθερο string — αν γράψεις
 * «grip» ή «neck», γίνεται κανονική κατηγορία, δεν μπαίνει στο «other».
 */
export async function createExercise(input: ExerciseInput): Promise<Exercise> {
  const t = now();
  const e: Exercise = {
    id: uuid(),
    user_id: getCurrentUserId(),
    name: input.name.trim(),
    category: input.category ?? 'other',
    movement_type: input.movement_type ?? 'compound',
    equipment: input.equipment ?? [],
    is_weighted: input.is_weighted ?? true,
    is_bodyweight: input.is_bodyweight ?? false,
    default_unit: input.default_unit ?? 'kg',
    notes: input.notes ?? null,
    is_archived: false,
    created_at: t,
    updated_at: t,
    deleted_at: null,
  };
  await db.exercises.add(e);
  return e;
}

export async function updateExercise(
  id: string,
  patch: Partial<Omit<Exercise, 'id' | 'created_at'>>,
): Promise<void> {
  await db.exercises.update(id, { ...patch, updated_at: now() });
}

/**
 * Αρχειοθέτηση αντί για διαγραφή: τα παλιά σετ δείχνουν σε αυτή την άσκηση
 * και το ιστορικό δεν επιτρέπεται να σπάσει. Ισχύει και για τις builtin —
 * αν δεν κάνεις ποτέ Human Flag, κρύψ' την.
 */
export async function setExerciseArchived(id: string, archived: boolean): Promise<void> {
  await db.exercises.update(id, { is_archived: archived, updated_at: now() });
}

/** Όλες, μαζί με τις αρχειοθετημένες — για την οθόνη διαχείρισης. */
export async function listAllExercises(): Promise<Exercise[]> {
  const all = await db.exercises.toArray();
  return all
    .filter((e) => isVisibleToMe(e) && e.deleted_at == null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Οι κατηγορίες που ΥΠΑΡΧΟΥΝ πραγματικά, builtin + δικές σου. */
export async function listExerciseCategories(): Promise<string[]> {
  const all = await listAllExercises();
  const set = new Set<string>(BUILTIN_EXERCISE_CATEGORIES);
  for (const e of all) set.add(e.category);
  return [...set].sort();
}

/* ─────────── Δικά σου skills & βήματα (v5) ─────────── */

export interface SkillInput {
  name: string;
  category?: SkillCategory;
  description?: string;
  ultimate_goal?: string;
  difficulty?: Skill['difficulty'];
}

/** Δικό σου skill tree — ο πυρήνας του app παύει να είναι read-only. */
export async function createSkill(input: SkillInput): Promise<Skill> {
  const t = now();
  const count = await db.skills.count();
  const name = input.name.trim();
  const s: Skill = {
    id: uuid(),
    name,
    // short_code: αρχικά των λέξεων, ώστε να μη ζητάμε από τον χρήστη κάτι τεχνικό
    short_code: name
      .split(/\s+/)
      .map((w) => w[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 4) || 'SKL',
    user_id: getCurrentUserId(),
    category: input.category ?? 'mixed',
    description: input.description ?? '',
    ultimate_goal: input.ultimate_goal ?? '',
    difficulty: input.difficulty ?? 3,
    display_order: count,
    is_archived: false,
    created_at: t,
    updated_at: t,
  };
  await db.skills.add(s);
  return s;
}

export async function updateSkill(
  id: string,
  patch: Partial<Omit<Skill, 'id' | 'created_at'>>,
): Promise<void> {
  await db.skills.update(id, { ...patch, updated_at: now() });
}

export async function setSkillArchived(id: string, archived: boolean): Promise<void> {
  await db.skills.update(id, { is_archived: archived, updated_at: now() });
}

export interface SkillStepInput {
  name: string;
  description?: string;
  target_type?: SkillTargetType;
  target_value?: number;
  target_unit?: string;
  benchmark_video_url?: string | null;
}

/**
 * Προσθέτει βήμα στο τέλος του tree. Το προηγούμενο βήμα γίνεται αυτόματα
 * προαπαιτούμενο — έτσι δουλεύει μια progression, δεν χρειάζεται να το ορίσεις.
 */
export async function addSkillStep(
  skillId: string,
  input: SkillStepInput,
): Promise<SkillStep> {
  const t = now();
  const existing = await db.skill_steps.where('skill_id').equals(skillId).sortBy('step_number');
  const prev = existing[existing.length - 1];
  const step: SkillStep = {
    id: uuid(),
    skill_id: skillId,
    step_number: (prev?.step_number ?? 0) + 1,
    name: input.name.trim(),
    description: input.description ?? '',
    target_type: input.target_type ?? 'hold',
    target_value: input.target_value ?? 0,
    target_unit: input.target_unit ?? 'sec',
    benchmark_video_url: input.benchmark_video_url ?? null,
    prerequisites: prev ? [prev.id] : [],
    created_at: t,
    updated_at: t,
  };
  await db.skill_steps.add(step);
  return step;
}

export async function updateSkillStep(
  id: string,
  patch: Partial<Omit<SkillStep, 'id' | 'skill_id' | 'created_at'>>,
): Promise<void> {
  await db.skill_steps.update(id, { ...patch, updated_at: now() });
}

/**
 * Διαγράφει βήμα και ξανα-αριθμεί τα υπόλοιπα, ξαναδένοντας την αλυσίδα
 * προαπαιτούμενων — αλλιώς το tree μένει με τρύπα και σπασμένο prerequisite.
 */
export async function removeSkillStep(id: string): Promise<void> {
  const step = await db.skill_steps.get(id);
  if (!step) return;
  await db.user_skill_step_completions.where('skill_step_id').equals(id).delete();
  await db.skill_steps.delete(id);
  const rest = await db.skill_steps
    .where('skill_id')
    .equals(step.skill_id)
    .sortBy('step_number');
  const t = now();
  for (let i = 0; i < rest.length; i++) {
    const prev = i === 0 ? null : rest[i - 1]!;
    await db.skill_steps.update(rest[i]!.id, {
      step_number: i + 1,
      prerequisites: prev ? [prev.id] : [],
      updated_at: t,
    });
  }
}

/* ─────────── Δικές σου δραστηριότητες (v5) ─────────── */

export async function listActivities(includeArchived = false): Promise<Activity[]> {
  const all = await db.activities.toArray();
  return all
    .filter((a) => isVisibleToMe(a) && (includeArchived || !a.is_archived))
    .sort((a, b) => a.display_order - b.display_order);
}

export async function getActivity(key: string): Promise<Activity | undefined> {
  return db.activities.where('key').equals(key).first();
}

export interface ActivityInput {
  label: string;
  icon?: string;
  dot_class?: string;
  uses_sets?: boolean;
  tracks_distance?: boolean;
}

/**
 * Δικό σου άθλημα. Το `key` παράγεται από το label (slug) και μένει σταθερό
 * ακόμα κι αν μετονομάσεις — τα workouts δείχνουν στο key, όχι στο label.
 */
export async function createActivity(input: ActivityInput): Promise<Activity> {
  const t = now();
  // NFD + αφαίρεση τόνων: χωρίς αυτό το «Παρκούρ» γινόταν «παρκο-ρ», γιατί
  // τα τονούμενα φωνήεντα δεν ανήκουν στο εύρος α-ω.
  const base =
    input.label
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9α-ω]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'activity';
  let key = base;
  for (let i = 2; await getActivity(key); i++) key = `${base}-${i}`;
  const count = await db.activities.count();
  const a: Activity = {
    id: uuid(),
    user_id: getCurrentUserId(),
    key,
    label: input.label.trim(),
    icon: input.icon ?? '•',
    dot_class: input.dot_class ?? 'bg-zinc-400',
    uses_sets: input.uses_sets ?? false,
    tracks_distance: input.tracks_distance ?? false,
    is_builtin: false,
    display_order: count,
    is_archived: false,
    created_at: t,
    updated_at: t,
  };
  await db.activities.add(a);
  return a;
}

export async function updateActivity(
  id: string,
  patch: Partial<Omit<Activity, 'id' | 'key' | 'is_builtin' | 'created_at'>>,
): Promise<void> {
  await db.activities.update(id, { ...patch, updated_at: now() });
}

export async function reorderActivities(orderedIds: string[]): Promise<void> {
  const t = now();
  await Promise.all(
    orderedIds.map((id, i) => db.activities.update(id, { display_order: i, updated_at: t })),
  );
}

/* ─────────── Προφίλ σε αυτή τη συσκευή (v6) ─────────── */

/**
 * ⚠️ Τα προφίλ ΔΕΝ είναι λογαριασμοί: δεν προστατεύονται με κωδικό και
 * όποιος έχει τη συσκευή τα βλέπει όλα. Είναι διαχωρισμός δεδομένων
 * («ποιανού προπόνηση καταγράφω»), όχι ασφάλεια — αυτή θέλει server.
 */
export async function listProfiles(): Promise<User[]> {
  const rows = await db.users.toArray();
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function getCurrentProfile(): Promise<User | undefined> {
  return db.users.get(getCurrentUserId());
}

export async function createProfile(displayName: string): Promise<User> {
  const t = now();
  const id = uuid();
  const user: User = {
    id,
    email: null,
    display_name: displayName.trim() || null,
    units: 'metric',
    bodyweight_unit: 'kg',
    language: 'en',
    schema_version: SCHEMA_VERSION,
    created_at: t,
    updated_at: t,
    is_pro: false,
    pro_expires_at: null,
  };
  await db.users.add(user);
  // Κάθε προφίλ έχει δικές του ρυθμίσεις — αλλιώς θα κληρονομούσε του προηγούμενου.
  await db.app_settings.add({
    id: uuid(),
    user_id: id,
    default_rest_timer_seconds: 180,
    notify_pr: true,
    notify_session_reminder: false,
    notify_rest_timer: true,
    reminder_time: null,
    reminder_days: [],
    show_e1rm: true,
    weight_unit: 'kg',
    theme: 'dark',
    created_at: t,
    updated_at: t,
  });
  return user;
}

export async function renameProfile(id: string, displayName: string): Promise<void> {
  await db.users.update(id, {
    display_name: displayName.trim() || null,
    updated_at: now(),
  });
}

/**
 * Σβήνει το προφίλ ΚΑΙ όλα του τα δεδομένα. Μη αναστρέψιμο — το UI οφείλει
 * να ζητήσει ρητή επιβεβαίωση. Τα seeded δεδομένα (`user_id === null`)
 * είναι κοινά και δεν αγγίζονται.
 */
export async function deleteProfile(id: string): Promise<void> {
  const workouts = await db.workouts.where('user_id').equals(id).toArray();
  const workoutIds = new Set(workouts.map((w) => w.id));

  const sets = await db.sets.toArray();
  await db.sets.bulkDelete(
    sets.filter((s) => workoutIds.has(s.workout_id)).map((s) => s.id),
  );

  const programs = await db.programs.where('user_id').equals(id).toArray();
  const programIds = new Set(programs.map((p) => p.id));
  const programExercises = await db.program_exercises.toArray();
  await db.program_exercises.bulkDelete(
    programExercises.filter((r) => programIds.has(r.program_id)).map((r) => r.id),
  );

  await db.workouts.where('user_id').equals(id).delete();
  await db.programs.where('user_id').equals(id).delete();
  await db.personal_records.where('user_id').equals(id).delete();
  await db.body_metrics.where('user_id').equals(id).delete();
  await db.user_skill_progress.where('user_id').equals(id).delete();
  await db.user_skill_step_completions.where('user_id').equals(id).delete();
  await db.app_settings.where('user_id').equals(id).delete();
  await db.exercises.where('user_id').equals(id).delete();
  await db.activities.where('user_id').equals(id).delete();
  await db.users.delete(id);
}

/** Πόσα δεδομένα κρέμονται από ένα προφίλ — για να ξέρει ΤΙ σβήνει. */
export async function getProfileStats(id: string) {
  const [workouts, prs, programs] = await Promise.all([
    db.workouts.where('user_id').equals(id).count(),
    db.personal_records.where('user_id').equals(id).count(),
    db.programs.where('user_id').equals(id).count(),
  ]);
  return { workouts, prs, programs };
}
