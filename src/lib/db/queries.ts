/**
 * DB query helpers for the workout flow.
 * Components MUST go through this module — never call db.* directly.
 *
 * All writes stamp updated_at and respect soft-delete semantics
 * (deleted_at instead of physical removal).
 */

import { v4 as uuid } from 'uuid';
import type { Table } from 'dexie';
import { db, SCHEMA_VERSION } from './schema';
import { getCurrentUserId, setCurrentUserId } from './session';
import { candidatesFromSet, candidatesFromWorkout, isNewPR } from '../domain/pr';
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
  PRType,
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

/**
 * Μεσημέρι ΤΟΠΙΚΗΣ ώρας για μια ημερομηνία YYYY-MM-DD.
 *
 * Το UTC μεσημέρι (`${isoDay}T12:00:00.000Z`) φαίνεται «ασφαλές» αλλά δεν
 * είναι: σε ζώνες πολύ μακριά από UTC (π.χ. UTC+13/+14) το UTC μεσημέρι
 * πέφτει ήδη στην ΕΠΟΜΕΝΗ τοπική μέρα, οπότε ένα backdated workout
 * καταλήγει με λάθος ημερομηνία στο ημερολόγιο/ιστορικό. Χτίζοντας το Date
 * από τοπικά y/m/d αποφεύγουμε τελείως τον υπολογισμό μέσω UTC.
 */
function localNoon(isoDay: string): Date {
  const [y, m, d] = isoDay.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export async function startWorkout(
  activityKind: ActivityKind = 'strength',
  /**
   * v8: προαιρετική ημερομηνία YYYY-MM-DD για backdated workout («χθες
   * έκανα αυτό»). Το started_at μπαίνει στο ΤΟΠΙΚΟ μεσημέρι εκείνης της
   * μέρας ώστε να πέφτει σίγουρα στη σωστή τοπική ημέρα σε calendar/history.
   */
  onDate?: string,
): Promise<Workout> {
  const t = now();
  const startedAt = onDate ? localNoon(onDate).toISOString() : t;
  const w: Workout = {
    id: uuid(),
    user_id: getCurrentUserId(),
    started_at: startedAt,
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
  const elapsed = Math.round((endedMs - startedMs) / 1000);
  // Backdated workout (started_at παλιότερο από ~12 ώρες): το wall-clock
  // duration θα ήταν λάθος (δεν το έκανες live), οπότε δεν το μετράμε.
  // Το ended_at ισούται με το started_at ώστε να μείνει στη σωστή μέρα.
  const backdated = elapsed > 12 * 3600;
  const duration = backdated ? null : Math.max(0, elapsed);
  await db.workouts.update(workoutId, {
    ended_at: backdated ? w.started_at : t,
    duration_seconds: duration,
    updated_at: t,
  });
  // Ένας δρομέας/κολυμβητής αξίζει το ίδιο PR-tracking με έναν lifter —
  // η απόσταση/διάρκεια μπαίνει ΤΩΡΑ που είναι τελική (distance_km μπορεί
  // να ενημερώθηκε κατά τη διάρκεια μέσω updateWorkoutDistance). Ελέγχουμε
  // `uses_sets` της δραστηριότητας (όχι hardcoded ονόματα) — αλλιώς μια
  // δική σου set-logged δραστηριότητα θα έπαιρνε ψευδές «longest duration»
  // PR από την απλή διάρκεια της συνεδρίας.
  const activity = await getActivity(w.activity_kind);
  if (activity ? !activity.uses_sets : w.activity_kind !== 'strength' && w.activity_kind !== 'skill') {
    await detectActivityPRs({ ...w, duration_seconds: duration });
  }
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

/**
 * Σβήνει μια προπόνηση ΚΑΙ ό,τι γέννησε.
 *
 * Πριν, σημαδευόταν μόνο η ίδια η προπόνηση: τα σετ της έμεναν «ζωντανά» και
 * — χειρότερα — τα ρεκόρ που είχε γεννήσει έμεναν στον πίνακα. Έσβηνες μια
 * λάθος καταχώριση και το app συνέχιζε να σου λέει ότι σήκωσες 200kg.
 *
 * Τα PR διαγράφονται οριστικά (δεν είναι δικά σου δεδομένα — είναι *παράγωγα*
 * των σετ· θα ξαναϋπολογιστούν από ό,τι απομένει). Σετ και προπόνηση μένουν
 * σε soft delete, όπως όλα τα υπόλοιπα, ώστε ένα μελλοντικό sync να ξέρει τι
 * συνέβη.
 */
export async function softDeleteWorkout(workoutId: string): Promise<void> {
  const t = now();
  await db.transaction('rw', db.workouts, db.sets, db.personal_records, async () => {
    await db.workouts.update(workoutId, { deleted_at: t, updated_at: t });
    await db.sets
      .where('workout_id')
      .equals(workoutId)
      .modify({ deleted_at: t, updated_at: t });
    await db.personal_records.where('user_id').equals(getCurrentUserId()).and(
      (r) => r.workout_id === workoutId,
    ).delete();
  });
}

/**
 * Αλλάζει πότε έγινε μια προπόνηση.
 *
 * Κρατά την ώρα της ημέρας όπου γίνεται — μια προπόνηση που μετακινείται από
 * την Τρίτη στη Δευτέρα δεν πρέπει να αλλάξει και ώρα. Η διάρκεια δεν
 * αγγίζεται· μόνο η μέρα.
 */
export async function setWorkoutDate(workoutId: string, isoDay: string): Promise<void> {
  const w = await db.workouts.get(workoutId);
  if (!w) return;

  const started = new Date(w.started_at);
  const [y, m, d] = isoDay.split('-').map(Number);
  if (!y || !m || !d) return;
  const moved = new Date(started);
  moved.setFullYear(y, m - 1, d);

  const patch: Partial<Workout> = { started_at: moved.toISOString(), updated_at: now() };
  // Το ended_at μετακινείται μαζί, ώστε η διάρκεια να μείνει ίδια.
  if (w.ended_at) {
    const delta = moved.getTime() - started.getTime();
    patch.ended_at = new Date(new Date(w.ended_at).getTime() + delta).toISOString();
  }
  await db.workouts.update(workoutId, patch);
}

/** Αλλάζει το άθλημα μιας καταγεγραμμένης προπόνησης. */
export async function setWorkoutActivity(
  workoutId: string,
  activityKind: ActivityKind,
): Promise<void> {
  await db.workouts.update(workoutId, { activity_kind: activityKind, updated_at: now() });
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

/** Ολοκληρωμένες προπονήσεις αυτού του προφίλ, πιο πρόσφατη πρώτη — για το History. */
export async function listCompletedWorkouts(): Promise<Workout[]> {
  const all = await db.workouts.where('user_id').equals(getCurrentUserId()).toArray();
  return all
    .filter((w) => w.ended_at != null && w.deleted_at == null)
    .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''));
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

/** Το σετ + ποια ρεκόρ έσπασε — ώστε το UI να το γιορτάσει. */
export interface AddSetResult extends SetEntry {
  newPRs: PRType[];
}

export async function addSet(input: AddSetInput): Promise<AddSetResult> {
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
  const newPRs = set.is_warmup ? [] : await detectPRs(set, input.workout_id);
  return { ...set, newPRs };
}

/**
 * Ελέγχει κάθε PR-υποψηφιότητα του σετ έναντι του τρέχοντος ρεκόρ και
 * αποθηκεύει ό,τι είναι νέο. Επιστρέφει ποια ρεκόρ έσπασαν ώστε το UI να
 * τα γιορτάσει.
 */
async function detectPRs(set: SetEntry, workoutId: string): Promise<PRType[]> {
  const t = now();
  const broken: PRType[] = [];
  const candidates = candidatesFromSet(set);
  if (candidates.length === 0) return broken;

  const existing = await db.personal_records
    .where('user_id')
    .equals(getCurrentUserId())
    .filter((r) => r.exercise_id === set.exercise_id)
    .toArray();

  // Πρώτο σετ ΠΟΤΕ σε αυτή την άσκηση δεν «γιορτάζεται» ως PR — αλλιώς κάθε
  // νέα άσκηση θα έριχνε κομφετί. PR = ξεπερνάς κάτι που ΗΔΗ είχες.
  const hadHistory = existing.length > 0;

  for (const c of candidates) {
    const current = existing.find((r) => r.type === c.type) ?? null;
    if (!isNewPR(c, current)) continue;
    if (hadHistory && current) broken.push(c.type);
    await db.personal_records.add({
      id: uuid(),
      user_id: getCurrentUserId(),
      exercise_id: set.exercise_id,
      activity_kind: null,
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
  return broken;
}

/**
 * PR για δραστηριότητες χωρίς σετ (τρέξιμο/ποδήλατο/κολύμβηση…). Καλείται
 * από endWorkout όταν η προπόνηση έχει απόσταση ή διάρκεια χωρίς σετ —
 * ίδιος σκελετός με το detectPRs, απλά κλειδώνει σε activity_kind αντί
 * για exercise_id.
 */
async function detectActivityPRs(workout: Workout): Promise<void> {
  const t = now();
  const candidates = candidatesFromWorkout(workout);
  if (candidates.length === 0) return;

  const existing = await db.personal_records
    .where('user_id')
    .equals(getCurrentUserId())
    .filter((r) => r.activity_kind === workout.activity_kind)
    .toArray();

  for (const c of candidates) {
    const current = existing.find((r) => r.type === c.type) ?? null;
    if (!isNewPR(c, current)) continue;
    await db.personal_records.add({
      id: uuid(),
      user_id: getCurrentUserId(),
      exercise_id: null,
      activity_kind: workout.activity_kind,
      type: c.type,
      value: c.value,
      reps: c.reps,
      weight_kg: c.weight_kg,
      achieved_at: t,
      workout_id: workout.id,
      set_id: null,
      created_at: t,
      updated_at: t,
    });
  }
}

/** PRs ανά άσκηση — για το UI (exercise_id → PersonalRecord[]). Μόνο strength PRs. */
export async function getPRsByExercise(): Promise<Map<string, PersonalRecord[]>> {
  const rows = await db.personal_records
    .where('user_id')
    .equals(getCurrentUserId())
    .toArray();
  const m = new Map<string, PersonalRecord[]>();
  for (const r of rows) {
    if (r.exercise_id == null) continue;
    const arr = m.get(r.exercise_id) ?? [];
    arr.push(r);
    m.set(r.exercise_id, arr);
  }
  return m;
}

/**
 * Τα τρέχοντα PRs μιας δραστηριότητας χωρίς σετ (type → PersonalRecord).
 * Κρατάμε το πιο ΠΡΟΣΦΑΤΟ ανά type: το detectActivityPRs γράφει νέα εγγραφή
 * μόνο όταν σπάει το ρεκόρ, άρα το τελευταίο achieved_at είναι το ισχύον PR.
 * (Χωρίς ταξινόμηση θα κρατούσαμε τυχαία εγγραφή, αφού τα ids είναι uuid.)
 */
export async function getActivityPRs(activityKind: string): Promise<Map<PRType, PersonalRecord>> {
  const rows = (
    await db.personal_records
      .where('user_id')
      .equals(getCurrentUserId())
      .filter((r) => r.activity_kind === activityKind)
      .toArray()
  ).sort((a, b) => a.achieved_at.localeCompare(b.achieved_at));
  const m = new Map<PRType, PersonalRecord>();
  for (const r of rows) m.set(r.type, r);
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
      | 'weight_kg'
      | 'reps'
      | 'hold_seconds'
      | 'notes'
      | 'rpe'
      | 'rir'
      | 'tempo'
      // set_type/group_id: διορθώνεις ένα ήδη καταγεγραμμένο σετ σε
      // dropset/superset (ή το βγάζεις από την αλυσίδα) — πριν ήταν
      // αδύνατο να αλλάξεις αυτά τα δύο μετά την καταγραφή.
      | 'set_type'
      | 'group_id'
    >
  >,
): Promise<void> {
  await db.sets.update(setId, { ...patch, updated_at: now() });
}

/**
 * «Τι έκανα την τελευταία φορά σε αυτή την άσκηση» — για auto-fill του logger.
 * Το πιο πρόσφατο ΜΗ-warmup σετ· τα ζεστάματα δεν είναι απόδοση προς επανάληψη.
 */
export async function getLastPerformance(exerciseId: string): Promise<{
  weight_kg: number | null;
  reps: number | null;
  hold_seconds: number | null;
  bodyweight_kg: number | null;
  achieved_at: string;
} | null> {
  const rows = await db.sets
    .where('exercise_id')
    .equals(exerciseId)
    .filter((s) => s.deleted_at == null && !s.is_warmup)
    .toArray();
  if (rows.length === 0) return null;
  const last = rows.sort((a, b) => b.created_at.localeCompare(a.created_at))[0]!;
  return {
    weight_kg: last.weight_kg,
    reps: last.reps,
    hold_seconds: last.hold_seconds,
    bodyweight_kg: last.bodyweight_kg,
    achieved_at: last.created_at,
  };
}

/**
 * Περίληψη ανά άσκηση για badges στις λίστες — «πότε την έκανα τελευταία»
 * και «έχει PR». Ένα pass αντί για N queries ανά γραμμή.
 */
export async function getExerciseSummaries(): Promise<
  Map<string, { lastTrainedAt: string | null; hasPR: boolean }>
> {
  const sets = await db.sets.filter((s) => s.deleted_at == null).toArray();
  const prByExercise = await getPRsByExercise();
  const out = new Map<string, { lastTrainedAt: string | null; hasPR: boolean }>();
  for (const s of sets) {
    const cur = out.get(s.exercise_id) ?? { lastTrainedAt: null, hasPR: false };
    if (cur.lastTrainedAt == null || s.created_at > cur.lastTrainedAt) {
      cur.lastTrainedAt = s.created_at;
    }
    out.set(s.exercise_id, cur);
  }
  for (const [exId, prs] of prByExercise) {
    const cur = out.get(exId) ?? { lastTrainedAt: null, hasPR: false };
    cur.hasPR = prs.length > 0;
    out.set(exId, cur);
  }
  return out;
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

/**
 * Πλήθος βημάτων + πόσα ολοκλήρωσες, ανά skill — ΜΟΝΟ για ό,τι skill βλέπει
 * αυτό το προφίλ. Χωρίς το φιλτράρισμα σε visible skill ids, δύο προφίλ που
 * δουλεύουν το ΙΔΙΟ seeded skill θα έβλεπαν το ποσοστό προόδου του άλλου
 * μπλεγμένο με το δικό τους.
 */
/**
 * Μαζεύει τα ακατέργαστα νούμερα για το gamification (lib/gamification.ts τα
 * μετατρέπει σε XP/level/badges). Όλα scoped στο τρέχον προφίλ.
 */
export async function getGamificationInput(): Promise<{
  completedWorkouts: number;
  totalSets: number;
  prCount: number;
  masteredSteps: number;
  masteredSkills: number;
  streakDays: number;
  longestStreakDays: number;
}> {
  const uid = getCurrentUserId();
  const [workouts, prs, insights, skillStats, progress] = await Promise.all([
    listCompletedWorkouts(),
    db.personal_records.where('user_id').equals(uid).toArray(),
    getTrainingInsights(30),
    getSkillStepStats(),
    getAllSkillProgress(),
  ]);
  // Τα sets ανήκουν μέσω workout_id (δεν έχουν δικό τους user_id index) —
  // παίρνουμε μόνο όσα ανήκουν σε ΔΙΚΕΣ σου ολοκληρωμένες προπονήσεις.
  const completedIds = workouts.map((w) => w.id);
  const sets = await db.sets.where('workout_id').anyOf(completedIds).toArray();
  const totalSets = sets.filter((s) => s.deleted_at == null && !s.is_warmup).length;
  const masteredSteps = [...skillStats.values()].reduce((sum, s) => sum + s.done, 0);
  const masteredSkills = [...progress.values()].filter((p) => p.status === 'mastered').length;
  return {
    completedWorkouts: workouts.length,
    totalSets,
    prCount: prs.length,
    masteredSteps,
    masteredSkills,
    streakDays: insights.streakDays,
    longestStreakDays: insights.longestStreakDays,
  };
}

export async function getSkillStepStats(): Promise<Map<string, { total: number; done: number }>> {
  const visibleSkillIds = new Set((await listSkills(true)).map((s) => s.id));
  const [steps, completions] = await Promise.all([
    db.skill_steps.toArray(),
    db.user_skill_step_completions.where('user_id').equals(getCurrentUserId()).toArray(),
  ]);
  const stepToSkill = new Map(
    steps.filter((s) => visibleSkillIds.has(s.skill_id)).map((s) => [s.id, s.skill_id]),
  );

  const out = new Map<string, { total: number; done: number }>();
  for (const skillId of stepToSkill.values()) {
    const cur = out.get(skillId) ?? { total: 0, done: 0 };
    cur.total += 1;
    out.set(skillId, cur);
  }
  for (const c of completions) {
    const skillId = stepToSkill.get(c.skill_step_id);
    if (!skillId) continue;
    const cur = out.get(skillId) ?? { total: 0, done: 0 };
    cur.done += 1;
    out.set(skillId, cur);
  }
  return out;
}

/* ─────────── Data ownership (export / import) ─────────── */

/**
 * CSV μιας άσκησης — για δικό σου spreadsheet/ανάλυση. Το exportAll είναι
 * ολόκληρη η ΤΟΠΙΚΗ βάση σε JSON (όλα τα προφίλ μαζί — δες exportAll)· εδώ
 * θέλεις μόνο το squat σου σε στήλες.
 */
export async function exportExerciseCsv(exerciseId: string): Promise<string> {
  const rows = (
    await db.sets.where('exercise_id').equals(exerciseId).toArray()
  )
    .filter((s) => s.deleted_at == null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const header = 'date,set_number,weight_kg,reps,hold_seconds,rpe,rir,e1rm,volume';
  const csv = (v: number | string | null) => (v == null ? '' : String(v));
  const lines = rows.map((s) => {
    const est = s.weight_kg != null && s.reps != null ? Math.round(e1rm(s.weight_kg, s.reps) * 10) / 10 : null;
    return [
      s.created_at.slice(0, 10),
      s.set_number,
      csv(s.weight_kg),
      csv(s.reps),
      csv(s.hold_seconds),
      csv(s.rpe),
      csv(s.rir),
      csv(est),
      csv(setVolume(s)),
    ].join(',');
  });
  return [header, ...lines].join('\n');
}

/*
 * Ό,τι πίνακας κουβαλάει δεδομένα χρήστη μπαίνει ΚΑΙ στο export ΚΑΙ στο import
 * ΚΑΙ στο server sync (ίδιο allowlist με server/API-CONTRACT.md). Η v1 του
 * format έχανε 7 πίνακες (goals, programs, body_metrics, activities,
 * skills…) — μια «πλήρης» επαναφορά πετούσε σιωπηλά τη διατροφή, τις ρουτίνες
 * και τους στόχους. Τα skills/skill_steps μπαίνουν κι αυτά: κρατούν custom
 * skills και μετονομασίες των builtin· το bootstrap κάνει add-missing-only,
 * άρα η εισαγωγή τους δεν συγκρούεται με το seeding.
 * (Μόνο το events_outgoing μένει έξω — νεκρό sync stub, όχι δεδομένα χρήστη.)
 *
 * Exported ώστε migrateProfileUserId() και ο sync engine (src/lib/sync) να
 * μη χρειάζεται να ξαναγράψουν αυτή τη λίστα.
 */
export const USER_DATA_TABLES = () => ({
  users: db.users, exercises: db.exercises, workouts: db.workouts,
  sets: db.sets, personal_records: db.personal_records,
  skills: db.skills, skill_steps: db.skill_steps,
  user_skill_progress: db.user_skill_progress,
  user_skill_step_completions: db.user_skill_step_completions,
  app_settings: db.app_settings, body_metrics: db.body_metrics,
  programs: db.programs, program_exercises: db.program_exercises,
  activities: db.activities, goals: db.goals,
});

/**
 * Πλήρες JSON backup — ΟΛΗ η τοπική βάση, ΟΛΑ τα προφίλ μαζί (ΔΕΝ φιλτράρει
 * με getCurrentUserId, εξ ορισμού — βλ. `users: db.users` παραπάνω χωρίς
 * `.where('user_id')`). Δεν είναι «export του τρέχοντος προφίλ»· είναι το
 * μονοπάτι πλήρους αντιγράφου/μετακόμισης συσκευής — αν έχεις πολλά προφίλ
 * σε αυτή τη συσκευή, φεύγουν όλα μαζί σε ένα αρχείο. Local-first σημαίνει:
 * τα δεδομένα φεύγουν όποτε θες.
 */
export async function exportAll(): Promise<string> {
  const tables = USER_DATA_TABLES();
  const names = Object.keys(tables) as (keyof ReturnType<typeof USER_DATA_TABLES>)[];
  const arrays = await Promise.all(names.map((n) => tables[n].toArray()));
  const data = Object.fromEntries(names.map((n, i) => [n, arrays[i]]));
  return JSON.stringify(
    {
      format: 'anabasis-backup',
      version: 2,
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
    steps: null,
    calories_in: null,
    calories_out: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
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

/**
 * Μαζική εισαγωγή ιστορικών μετρήσεων (π.χ. 11 μήνες θερμίδων από Notion).
 * Upsert ανά ημερομηνία — υπάρχουσα μέρα ενημερώνεται, δεν διπλασιάζεται.
 * Επιστρέφει πόσες προστέθηκαν/ενημερώθηκαν ώστε το UI να δείξει τι έγινε.
 */
export async function importBodyMetrics(
  rows: Array<{ date: string; patch: Partial<Omit<BodyMetric, 'id' | 'user_id' | 'date' | 'created_at' | 'updated_at'>> }>,
): Promise<{ added: number; updated: number }> {
  const t = now();
  const uid = getCurrentUserId();
  let added = 0;
  let updated = 0;
  for (const { date, patch } of rows) {
    const existing = await db.body_metrics
      .where('[user_id+date]')
      .equals([uid, date])
      .first();
    if (existing) {
      await db.body_metrics.update(existing.id, { ...patch, updated_at: t });
      updated += 1;
    } else {
      await db.body_metrics.add({
        id: uuid(),
        user_id: uid,
        date,
        weight_kg: null,
        steps: null,
        calories_in: null,
        calories_out: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
        body_fat_pct: null,
        notes: null,
        created_at: t,
        updated_at: t,
        ...patch,
      });
      added += 1;
    }
  }
  return { added, updated };
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
  steps: number | null;
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
      steps: r?.steps ?? null,
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
    target_sessions_per_week: null,
    is_archived: false,
    created_at: t,
    updated_at: t,
    deleted_at: null,
  };
  await db.programs.add(p);
  return p;
}

/**
 * Φτιάχνει πρόγραμμα από έτοιμο πρότυπο (programTemplates.ts). Οι ασκήσεις του
 * προτύπου δίνονται με ΟΝΟΜΑ: αντιστοιχίζονται case-insensitive στη βιβλιοθήκη
 * σου, κι ό,τι λείπει δημιουργείται ως δική σου άσκηση. Κάθε κλήση φτιάχνει
 * ΝΕΟ πρόγραμμα (fork) — δεν κάνει dedupe, ώστε να μπορείς να το τροποποιήσεις
 * ελεύθερα χωρίς να πειράξεις το πρότυπο.
 */
export async function createProgramFromTemplate(
  template: {
    name: string;
    exercises: {
      name: string;
      target_sets: number;
      target_reps: number | null;
      target_hold_seconds?: number;
      set_type?: SetType;
      group_key?: string | null;
    }[];
  },
): Promise<Program> {
  const program = await createProgram(template.name, 'strength');

  // Χάρτης ονόματος→id από τις ΔΙΚΕΣ σου ασκήσεις (scoped, όχι db.exercises.toArray()).
  const byName = new Map(
    (await listAllExercises()).map((e) => [e.name.trim().toLowerCase(), e.id]),
  );

  for (const te of template.exercises) {
    const key = te.name.trim().toLowerCase();
    let exerciseId = byName.get(key);
    if (!exerciseId) {
      const created = await createExercise({ name: te.name });
      exerciseId = created.id;
      byName.set(key, exerciseId);
    }
    await addProgramExercise(program.id, {
      exercise_id: exerciseId,
      target_sets: te.target_sets,
      target_reps: te.target_reps,
      target_hold_seconds: te.target_hold_seconds ?? null,
      set_type: te.set_type,
      group_key: te.group_key ?? null,
    });
  }
  return program;
}

export async function setProgramTarget(
  programId: string,
  perWeek: number | null,
): Promise<void> {
  await db.programs.update(programId, {
    target_sessions_per_week: perWeek,
    updated_at: now(),
  });
}

/**
 * Πόσες φορές έγινε αυτή τη ISO εβδομάδα, έναντι του στόχου. Αντιστοίχιση
 * γίνεται μέσω workout_type (αντίγραφο του ονόματος προγράμματος κατά το
 * startWorkoutFromProgram) — όχι FK. Ατέλεια γνωστή: μετονομασία προγράμματος
 * μετά την προπόνηση σπάει το ταίριασμα για παλιές εγγραφές.
 */
export async function getProgramAdherence(
  programId: string,
): Promise<{ target: number; completedThisWeek: number } | null> {
  const program = await db.programs.get(programId);
  if (!program || program.target_sessions_per_week == null) return null;

  const monday = new Date();
  const day = (monday.getDay() + 6) % 7; // 0 = Δευτέρα
  monday.setDate(monday.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  const weekStart = monday.toISOString();

  const rows = await db.workouts.where('user_id').equals(getCurrentUserId()).toArray();
  const completedThisWeek = rows.filter(
    (w) =>
      w.deleted_at == null &&
      w.ended_at != null &&
      w.workout_type === program.name &&
      w.started_at >= weekStart,
  ).length;

  return { target: program.target_sessions_per_week, completedThisWeek };
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

/**
 * Πολλές ασκήσεις σε ΕΝΑ write — αλλιώς φτιάξιμο 6-ασκήσεων προγράμματος
 * σημαίνει 6 ξεχωριστά awaits. Οι θέσεις συνεχίζουν από το τρέχον μήκος.
 */
export async function addProgramExercisesBulk(
  programId: string,
  exerciseIds: string[],
  defaults: Pick<ProgramExerciseInput, 'target_sets'> = {},
): Promise<ProgramExercise[]> {
  const t = now();
  const startPosition = await db.program_exercises
    .where('program_id')
    .equals(programId)
    .count();
  const rows: ProgramExercise[] = exerciseIds.map((exercise_id, i) => ({
    id: uuid(),
    program_id: programId,
    exercise_id,
    position: startPosition + i,
    target_sets: defaults.target_sets ?? null,
    target_reps: null,
    target_weight_kg: null,
    target_hold_seconds: null,
    set_type: 'normal',
    group_key: null,
    notes: null,
    created_at: t,
    updated_at: t,
  }));
  await db.program_exercises.bulkAdd(rows);
  return rows;
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

/**
 * Fork ενός προγράμματος — «Upper B» ως παραλλαγή του «Upper A» χωρίς να
 * ξαναχτίζεις τις γραμμές με το χέρι. Κρατά στόχους/set_type/group_key
 * ίδια· δικό του id ώστε οι αλλαγές στο ένα να μην αγγίζουν το άλλο.
 */
export async function duplicateProgram(
  programId: string,
  newName?: string,
): Promise<Program | null> {
  const data = await getProgramWithExercises(programId);
  if (!data) return null;

  const copy = await createProgram(
    newName?.trim() || `${data.program.name} (2)`,
    data.program.activity_kind,
  );
  for (const row of data.exercises) {
    await addProgramExercise(copy.id, {
      exercise_id: row.exercise_id,
      target_sets: row.target_sets,
      target_reps: row.target_reps,
      target_weight_kg: row.target_weight_kg,
      target_hold_seconds: row.target_hold_seconds,
      set_type: row.set_type,
      group_key: row.group_key,
      notes: row.notes,
    });
  }
  return copy;
}

export interface LastWorkoutPlanItem {
  exercise_id: string;
  target_sets: number;
  target_reps: number | null;
  target_weight_kg: number | null;
  target_hold_seconds: number | null;
  set_type: SetType;
}

/**
 * Ομαδοποιεί τα (μη-warmup) σετ ενός workout ανά άσκηση σε target_* πεδία:
 * πλήθος σετ + το βαρύτερο σετ ως στόχος. Το ΙΔΙΟ «κάνε ό,τι έκανα» θέλει
 * να δουλεύει είτε φτιάχνεις πρόγραμμα (programFromLastWorkout) είτε
 * ξεκινάς κατευθείαν νέο workout (startWorkoutFromLastOfKind) — μία λογική,
 * δύο μονοπάτια εξόδου.
 */
async function planFromWorkoutSets(workoutId: string): Promise<LastWorkoutPlanItem[]> {
  const sets = (await db.sets.where('workout_id').equals(workoutId).toArray()).filter(
    (s) => s.deleted_at == null && s.set_type !== 'warmup',
  );

  const byExercise = new Map<
    string,
    { count: number; weight: number | null; reps: number | null; hold: number | null; setType: SetType }
  >();
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

  return [...byExercise.entries()].map(([exercise_id, v]) => ({
    exercise_id,
    target_sets: v.count,
    target_reps: v.reps,
    target_weight_kg: v.weight,
    target_hold_seconds: v.hold,
    set_type: v.setType,
  }));
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

  const plan = await planFromWorkoutSets(last.id);
  if (plan.length === 0) return null;

  const prog = await createProgram(name, last.activity_kind ?? 'strength');
  for (const item of plan) {
    await addProgramExercise(prog.id, item);
  }
  return prog;
}

/**
 * Ξεκινά νέο workout σαν την τελευταία ΟΛΟΚΛΗΡΩΜΕΝΗ προπόνηση αυτού του
 * είδους — «κάνε ό,τι έκανα την τελευταία φορά», χωρίς να χρειάζεται
 * αποθηκευμένο πρόγραμμα. Ίδιο σχήμα επιστροφής με startWorkoutFromProgram
 * (workout + plan στόχων): το νέο workout ΔΕΝ γράφει σετ, το plan είναι
 * μόνο ό,τι στόχευε η προηγούμενη φορά.
 */
export async function startWorkoutFromLastOfKind(
  kind: ActivityKind,
): Promise<{ workout: Workout; plan: LastWorkoutPlanItem[] } | null> {
  const last = (
    await db.workouts.where('user_id').equals(getCurrentUserId()).toArray()
  )
    .filter((w) => w.activity_kind === kind && w.ended_at != null && w.deleted_at == null)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  if (!last) return null;

  const plan = await planFromWorkoutSets(last.id);
  const w = await startWorkout(kind);
  if (last.workout_type) {
    await db.workouts.update(w.id, { workout_type: last.workout_type, updated_at: now() });
  }
  return {
    workout: last.workout_type ? { ...w, workout_type: last.workout_type } : w,
    plan,
  };
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
    // Κενό = «καμία προτίμηση» → η Αρχική πέφτει στην προεπιλεγμένη διάταξη.
    dashboard_cards: [],
    notify_pr: true,
    notify_session_reminder: false,
    notify_rest_timer: true,
    auto_start_rest_timer: true,
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
 *
 * Ελέγχεται και τα 16 tables του schema — πριν έμεναν ορφανά goals (και θα
 * έμεναν ορφανά skills/skill_steps για δικά σου skills, καθώς και events),
 * γιατί η λίστα cascade δεν ακολουθούσε το σχήμα. Όλο το σβήσιμο τρέχει σε
 * ΜΙΑ transaction: ή φεύγουν όλα μαζί ή τίποτα — ένα crash στη μέση δεν
 * πρέπει να αφήνει το προφίλ μισοσβησμένο.
 */
export async function deleteProfile(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.workouts,
      db.sets,
      db.programs,
      db.program_exercises,
      db.personal_records,
      db.body_metrics,
      db.user_skill_progress,
      db.user_skill_step_completions,
      db.app_settings,
      db.exercises,
      db.activities,
      db.skills,
      db.skill_steps,
      db.goals,
      db.events_outgoing,
      db.users,
    ],
    async () => {
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

      // Δικά του skills (τα seeded, user_id === null, μένουν κοινά) + τα
      // βήματά τους — αλλιώς ένα skill_step μένει πίσω δείχνοντας σε ένα
      // skill_id που δεν υπάρχει πια.
      const skills = await db.skills.where('user_id').equals(id).toArray();
      const skillIds = new Set(skills.map((s) => s.id));
      const skillSteps = await db.skill_steps.toArray();
      await db.skill_steps.bulkDelete(
        skillSteps.filter((s) => skillIds.has(s.skill_id)).map((s) => s.id),
      );
      await db.skills.where('user_id').equals(id).delete();

      await db.workouts.where('user_id').equals(id).delete();
      await db.programs.where('user_id').equals(id).delete();
      await db.personal_records.where('user_id').equals(id).delete();
      await db.body_metrics.where('user_id').equals(id).delete();
      await db.user_skill_progress.where('user_id').equals(id).delete();
      await db.user_skill_step_completions.where('user_id').equals(id).delete();
      await db.app_settings.where('user_id').equals(id).delete();
      await db.exercises.where('user_id').equals(id).delete();
      await db.activities.where('user_id').equals(id).delete();
      await db.goals.where('user_id').equals(id).delete();
      await db.events_outgoing.where('user_id').equals(id).delete();
      await db.users.delete(id);
    },
  );
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

/**
 * Πλήθος δεδομένων του ΤΡΕΧΟΝΤΟΣ προφίλ — για οθόνες τύπου «about/data».
 * Τα σετ δεν έχουν δικό τους `user_id` (ανήκουν σε workout), γι' αυτό
 * περνάμε πρώτα από τα workout ids του προφίλ.
 */
export async function getCurrentProfileDataCounts(): Promise<{
  workouts: number;
  sets: number;
  prs: number;
  steps: number;
}> {
  const uid = getCurrentUserId();
  const workoutIds = new Set(
    (await db.workouts.where('user_id').equals(uid).toArray()).map((w) => w.id),
  );
  const [allSets, prs, steps] = await Promise.all([
    db.sets.toArray(),
    db.personal_records.where('user_id').equals(uid).count(),
    db.user_skill_step_completions.where('user_id').equals(uid).count(),
  ]);
  const sets = allSets.filter((s) => workoutIds.has(s.workout_id)).length;
  return { workouts: workoutIds.size, sets, prs, steps };
}

/**
 * Δένει το τρέχον τοπικό προφίλ σε λογαριασμό — server API-CONTRACT.md
 * «Binding κατά το login/signup». Ξαναγράφει το `user_id` σε όλα τα personal
 * δεδομένα, το ίδιο το `users.id`, και μεταθέτει το ενεργό session.
 *
 * Τρεις πίνακες (`sets`, `skill_steps`, `program_exercises`) ΔΕΝ έχουν δικό
 * τους `user_id` στο τοπικό schema — ανήκουν μέσω workout_id/skill_id/
 * program_id, ίδιο μοτίβο με το `deleteProfile` παραπάνω. Αφού ο γονέας τους
 * αλλάζει owner εδώ, ακολουθούν αυτόματα χωρίς δική τους εγγραφή.
 *
 * No-op όταν `oldId === newId`. Αν αυτή η συσκευή έχει ΗΔΗ ένα προφίλ δεμένο
 * στο `newId` (προηγούμενο login σε αυτό το device), ΔΕΝ ενοποιούμε τα δύο
 * σύνολα δεδομένων (θα συγκρούονταν τα ids) — απλώς εναλλάσσουμε session.
 */
export async function migrateProfileUserId(oldId: string, newId: string): Promise<void> {
  if (oldId === newId) return;

  if (await db.users.get(newId)) {
    setCurrentUserId(newId);
    return;
  }

  const directOwnerTables = [
    db.exercises, db.workouts, db.personal_records, db.skills,
    db.user_skill_progress, db.user_skill_step_completions, db.app_settings,
    db.body_metrics, db.programs, db.activities, db.goals,
    // Ετερόκλητα Table<T> — γενικεύουμε τον τύπο ώστε το .modify() να έχει
    // ΜΙΑ συμβατή υπογραφή αντί για union από 11 διαφορετικές.
  ] as unknown as Table<Record<string, unknown>, string>[];
  const t = now();

  await db.transaction('rw', [db.users, ...directOwnerTables], async () => {
    for (const table of directOwnerTables) {
      await table.where('user_id').equals(oldId).modify({ user_id: newId, updated_at: t });
    }

    const me = await db.users.get(oldId);
    if (me) {
      await db.users.add({ ...me, id: newId, updated_at: t });
      await db.users.delete(oldId);
    }
  });

  setCurrentUserId(newId);
}

/* ─────────── Analytics: activity progress, insights, feel, heatmap (v7) ─────────── */

export interface ActivityPoint {
  date: string;
  distanceKm: number | null;
  durationSeconds: number | null;
  paceSecPerKm: number | null;
}

/**
 * Πρόοδος δραστηριότητας χωρίς σετ (τρέξιμο/ποδήλατο/κολύμβηση) — το ίδιο
 * chart-εργαλείο που έχουν οι lifters, πάνω σε db.workouts αντί για db.sets.
 * Κρατά το «καλύτερο» της ημέρας: μέγιστη απόσταση, ταχύτερο pace.
 */
export async function getActivityProgress(
  activityKind: string,
  days = 180,
): Promise<ActivityPoint[]> {
  const since = Date.now() - days * 86400_000;
  const workouts = (
    await db.workouts.where('user_id').equals(getCurrentUserId()).toArray()
  ).filter(
    (w) =>
      w.deleted_at == null &&
      w.ended_at != null &&
      w.activity_kind === activityKind &&
      Date.parse(w.started_at) >= since,
  );

  const byDay = new Map<string, ActivityPoint>();
  for (const w of workouts) {
    const day = localDay(new Date(w.started_at));
    const cur =
      byDay.get(day) ??
      ({ date: day, distanceKm: null, durationSeconds: null, paceSecPerKm: null } as ActivityPoint);
    if (w.distance_km != null && (cur.distanceKm == null || w.distance_km > cur.distanceKm)) {
      cur.distanceKm = w.distance_km;
    }
    if (w.duration_seconds != null && (cur.durationSeconds == null || w.duration_seconds > cur.durationSeconds)) {
      cur.durationSeconds = w.duration_seconds;
    }
    if (w.distance_km != null && w.distance_km > 0 && w.duration_seconds != null) {
      const pace = w.duration_seconds / w.distance_km;
      if (cur.paceSecPerKm == null || pace < cur.paceSecPerKm) cur.paceSecPerKm = pace;
    }
    byDay.set(day, cur);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Ημέρες προπόνησης (distinct) στο διάστημα — για streak/adherence. */
async function trainingDays(): Promise<string[]> {
  const workouts = (
    await db.workouts.where('user_id').equals(getCurrentUserId()).toArray()
  ).filter((w) => w.deleted_at == null && w.ended_at != null);
  const days = new Set(workouts.map((w) => localDay(new Date(w.started_at))));
  return [...days].sort();
}

export interface TrainingInsights {
  streakDays: number;
  longestStreakDays: number;
  volumeDeltaPct: number | null;
  adherencePct: number | null;
  weightTrend: { ratePerWeekKg: number; projectedGoalDate: string | null } | null;
  prsThisPeriod: number;
}

/**
 * Rule-based insights (port του kalori μοτίβου: pure stat → threshold guard →
 * templated πρόταση). ΚΑΘΕ τιμή έχει «κατώφλι» (n≥…) στην UI ώστε να μη
 * βγαίνουν θορυβώδεις ισχυρισμοί από ελάχιστα δεδομένα.
 */
export interface WorkoutDetailExercise {
  exerciseId: string;
  name: string;
  sets: SetEntry[];
  volume: number;
  topWeightKg: number | null;
}

export interface WorkoutDetail {
  workout: Workout;
  activityLabel: string;
  exercises: WorkoutDetailExercise[];
  totalVolume: number;
  totalSets: number;
  /** Τα ρεκόρ που έπεσαν ΜΕΣΑ σε αυτή την προπόνηση. */
  prs: PersonalRecord[];
}

/**
 * Μια ολοκληρωμένη προπόνηση, όπως τη διαβάζεις εκ των υστέρων.
 *
 * Υπήρχε κενό στη ροή: το ημερολόγιο έδειχνε «έκανες κάτι εκείνη τη μέρα»
 * αλλά δεν πήγαινε πουθενά — έβλεπες μια κουκκίδα και τελείωνε εκεί. Χωρίς
 * αυτή τη σελίδα, όλο το ιστορικό ήταν αριθμοί χωρίς περιεχόμενο.
 */
export async function getWorkoutDetail(workoutId: string): Promise<WorkoutDetail | null> {
  const workout = await db.workouts.get(workoutId);
  if (!workout || workout.deleted_at != null || workout.user_id !== getCurrentUserId()) {
    return null;
  }

  const [sets, allExercises, activity, prs] = await Promise.all([
    db.sets.where('workout_id').equals(workoutId).sortBy('set_number'),
    db.exercises.toArray(),
    getActivity(workout.activity_kind),
    db.personal_records.where('user_id').equals(getCurrentUserId()).toArray(),
  ]);

  const live = sets.filter((s) => s.deleted_at == null);
  const names = new Map(allExercises.map((e) => [e.id, e.name]));

  // Ομαδοποίηση με σειρά πρώτης εμφάνισης — έτσι διαβάζεται όπως έγινε.
  const byExercise = new Map<string, SetEntry[]>();
  for (const s of live) {
    const list = byExercise.get(s.exercise_id);
    if (list) list.push(s);
    else byExercise.set(s.exercise_id, [s]);
  }

  const exercises: WorkoutDetailExercise[] = [...byExercise.entries()].map(
    ([exerciseId, exSets]) => ({
      exerciseId,
      name: names.get(exerciseId) ?? '—',
      sets: exSets,
      volume: exSets.reduce((a, s) => a + setVolume(s), 0),
      topWeightKg: exSets.reduce<number | null>(
        (max, s) => (s.weight_kg != null && (max == null || s.weight_kg > max) ? s.weight_kg : max),
        null,
      ),
    }),
  );

  return {
    workout,
    activityLabel: activity?.label ?? workout.activity_kind,
    exercises,
    totalVolume: exercises.reduce((a, e) => a + e.volume, 0),
    totalSets: live.filter((s) => s.set_type !== 'warmup' && !s.is_warmup).length,
    prs: prs.filter((r) => r.workout_id === workoutId),
  };
}

export interface ActiveLadderStep {
  id: string;
  stepNumber: number;
  name: string;
  targetValue: number;
  targetUnit: string;
  state: 'done' | 'current' | 'locked';
}

export interface ActiveLadder {
  skillId: string;
  skillName: string;
  steps: ActiveLadderStep[];
  /** Πόσα βήματα έχουν ολοκληρωθεί / σύνολο. */
  done: number;
  total: number;
}

/**
 * Το skill που δουλεύει ΤΩΡΑ ο χρήστης, μαζί με ολόκληρη τη σκάλα του.
 *
 * Αυτό είναι το διαφοροποιητικό του Anabasis έναντι των generic gym apps:
 * δεν μετράς σετ, ανεβαίνεις μια αλυσίδα προαπαιτούμενων. Το dashboard το
 * δείχνει πρώτο. Διαλέγουμε το πιο πρόσφατα ενημερωμένο `in_progress` skill
 * — αν δεν υπάρχει κανένα, γυρνάμε null (ΔΕΝ μαντεύουμε ένα τυχαίο).
 */
export async function getActiveLadder(): Promise<ActiveLadder | null> {
  const progress = (
    await db.user_skill_progress.where('user_id').equals(getCurrentUserId()).toArray()
  )
    .filter((p) => p.status === 'in_progress')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const active = progress[0];
  if (!active) return null;

  const bundle = await getSkillWithSteps(active.skill_id);
  if (!bundle || bundle.steps.length === 0) return null;

  const completions = await getStepCompletions(bundle.steps.map((s) => s.id));

  // Το «τρέχον» είναι το ρητό current_step_id· αλλιώς το πρώτο ανολοκλήρωτο.
  const firstOpen = bundle.steps.find((s) => !completions.has(s.id));
  const currentId = active.current_step_id ?? firstOpen?.id ?? null;

  const steps: ActiveLadderStep[] = bundle.steps.map((s) => ({
    id: s.id,
    stepNumber: s.step_number,
    name: s.name,
    targetValue: s.target_value,
    targetUnit: s.target_unit,
    state: completions.has(s.id) ? 'done' : s.id === currentId ? 'current' : 'locked',
  }));

  return {
    skillId: bundle.skill.id,
    skillName: bundle.skill.name,
    steps,
    done: steps.filter((s) => s.state === 'done').length,
    total: steps.length,
  };
}

export async function getTrainingInsights(days = 30): Promise<TrainingInsights> {
  const daysList = await trainingDays();
  const daySet = new Set(daysList);

  // streak: μετράμε πίσω από σήμερα (ή χθες) όσο υπάρχουν συνεχόμενες μέρες
  const countStreakFrom = (start: Date): number => {
    let n = 0;
    const d = new Date(start);
    while (daySet.has(localDay(d))) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  };
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const streakDays = daySet.has(localDay(today))
    ? countStreakFrom(today)
    : countStreakFrom(yesterday);

  // longest streak: σάρωση των ταξινομημένων ημερών
  let longestStreakDays = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const key of daysList) {
    const cur = new Date(key);
    if (prev && (cur.getTime() - prev.getTime()) / 86400_000 === 1) run++;
    else run = 1;
    if (run > longestStreakDays) longestStreakDays = run;
    prev = cur;
  }

  // adherence: μέρες προπόνησης / μέρες στο παράθυρο
  const windowStart = Date.now() - days * 86400_000;
  const inWindow = daysList.filter((k) => new Date(k).getTime() >= windowStart).length;
  const adherencePct = days > 0 ? Math.round((inWindow / days) * 100) : null;

  // volume delta: αυτό το παράθυρο vs το προηγούμενο ίσο
  const trend = await getVolumeTrend(days * 2);
  const half = Math.floor(trend.length / 2);
  const prevVol = trend.slice(0, half).reduce((a, p) => a + p.volume, 0);
  const curVol = trend.slice(half).reduce((a, p) => a + p.volume, 0);
  const volumeDeltaPct =
    prevVol > 0 ? Math.round(((curVol - prevVol) / prevVol) * 100) : null;

  // weight trend: γραμμικός ρυθμός/εβδομάδα από τα ζυγίσματα
  const body = await getBodyTrend(days);
  const weights = body
    .filter((p) => p.weight != null)
    .map((p) => ({ t: new Date(p.date).getTime(), w: p.weight as number }));
  let weightTrend: TrainingInsights['weightTrend'] = null;
  if (weights.length >= 2) {
    const n = weights.length;
    const meanT = weights.reduce((a, p) => a + p.t, 0) / n;
    const meanW = weights.reduce((a, p) => a + p.w, 0) / n;
    let num = 0;
    let den = 0;
    for (const p of weights) {
      num += (p.t - meanT) * (p.w - meanW);
      den += (p.t - meanT) ** 2;
    }
    const slopePerMs = den === 0 ? 0 : num / den;
    const ratePerWeekKg = Math.round(slopePerMs * 7 * 86400_000 * 100) / 100;
    weightTrend = { ratePerWeekKg, projectedGoalDate: null };
  }

  // PRs σε αυτό το παράθυρο
  const prs = await db.personal_records
    .where('user_id')
    .equals(getCurrentUserId())
    .toArray();
  const prsThisPeriod = prs.filter(
    (r) => new Date(r.achieved_at).getTime() >= windowStart,
  ).length;

  return {
    streakDays,
    longestStreakDays,
    volumeDeltaPct,
    adherencePct,
    weightTrend,
    prsThisPeriod,
  };
}

export interface FeelPoint {
  date: string;
  feel: number | null;
  volume: number;
}

/** Χρονοσειρά «αίσθησης» (feel 1-5) δίπλα στον όγκο — το feel καταγράφεται ήδη. */
export async function getFeelTrend(days = 60): Promise<FeelPoint[]> {
  const volume = await getVolumeTrend(days);
  const workouts = (
    await db.workouts.where('user_id').equals(getCurrentUserId()).toArray()
  ).filter((w) => w.deleted_at == null && w.feel != null);

  // πιο πρόσφατο feel της ημέρας
  const feelByDay = new Map<string, { feel: number; at: string }>();
  for (const w of workouts) {
    const day = localDay(new Date(w.started_at));
    const cur = feelByDay.get(day);
    if (!cur || w.started_at > cur.at) feelByDay.set(day, { feel: w.feel!, at: w.started_at });
  }
  return volume.map((v) => ({
    date: v.date,
    feel: feelByDay.get(v.date)?.feel ?? null,
    volume: v.volume,
  }));
}

export interface HeatCell {
  date: string;
  trained: boolean;
  hasPR: boolean;
}

/** Ημερολόγιο συνέπειας (GitHub-style) — trained/hasPR ανά μέρα. */
export async function getTrainingHeat(days = 91): Promise<HeatCell[]> {
  const daysList = new Set(await trainingDays());
  const prs = await db.personal_records
    .where('user_id')
    .equals(getCurrentUserId())
    .toArray();
  const prDays = new Set(prs.map((r) => localDay(new Date(r.achieved_at))));

  const out: HeatCell[] = [];
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = localDay(d);
    out.push({ date: key, trained: daysList.has(key), hasPR: prDays.has(key) });
  }
  return out;
}
