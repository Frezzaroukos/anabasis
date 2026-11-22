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
import { isWorkingSet } from '../domain/setFilters';
import { e1rm } from '../domain/e1rm';
import { BUILTIN_EXERCISE_CATEGORIES } from './types';
import {
  markScheduledDoneForWorkout,
  relinkScheduledForWorkout,
  revertScheduledForWorkout,
} from './scheduledSessionLinks';
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
  ProgramDay,
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
  /** v12: link σε πρόγραμμα/μέρα (ad-hoc = undefined) — για auto-numbering & calendar. */
  programId?: string | null,
  programDayId?: string | null,
  /** Το label γράφεται στο ΙΔΙΟ insert — όχι δεύτερο update που μπορεί να χαθεί. */
  workoutType?: string | null,
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
    workout_type: workoutType ?? null,
    activity_kind: activityKind,
    program_id: programId ?? null,
    program_day_id: programDayId ?? null,
    distance_km: null,
    feel: null,
    created_at: t,
    updated_at: t,
    deleted_at: null,
  };
  await db.workouts.add(w);
  return w;
}

export async function endWorkout(
  workoutId: string,
  /** Χειροκίνητο χρονόμετρο: αν δοθεί, ΑΥΤΟ είναι η διάρκεια (μόνο ο χρόνος που
   * μέτρησε ο χρήστης), αντί για wall-clock. */
  durationOverride?: number,
): Promise<void> {
  const t = now();
  const w = await db.workouts.get(workoutId);
  if (!w) return;
  const startedMs = Date.parse(w.started_at);
  const endedMs = Date.parse(t);
  const elapsed = Math.round((endedMs - startedMs) / 1000);
  // Backdated = η προπόνηση δεν ξεκίνησε τη μέρα που δημιουργήθηκε το row.
  // Το wall-clock duration θα ήταν λάθος, οπότε δεν το μετράμε· το ended_at
  // ισούται με το started_at ώστε να μείνει στη σωστή μέρα.
  const backdated =
    localDay(new Date(w.started_at)) !== localDay(new Date(w.created_at));
  const duration =
    durationOverride != null ? Math.max(0, Math.round(durationOverride)) : backdated ? null : Math.max(0, elapsed);
  await db.workouts.update(workoutId, {
    ended_at: backdated ? w.started_at : t,
    duration_seconds: duration,
    updated_at: t,
  });
  // Το planned row που γέννησε αυτή την προπόνηση ολοκληρώθηκε μαζί της.
  await markScheduledDoneForWorkout(workoutId, t);
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
 * Τα PR είναι *παράγωγα* των σετ: ξαναϋπολογίζονται από ό,τι απομένει
 * (`recomputePRsForExercise`, με tombstones για το sync). Σετ και προπόνηση
 * μένουν σε soft delete, ώστε το sync να ξέρει τι συνέβη.
 */
export async function softDeleteWorkout(workoutId: string): Promise<void> {
  const t = now();
  const workout = await db.workouts.get(workoutId);
  const sets = await db.sets.where('workout_id').equals(workoutId).toArray();
  const affectedExercises = new Set(
    sets.filter((s) => s.deleted_at == null).map((s) => s.exercise_id),
  );
  await db.transaction('rw', db.workouts, db.sets, db.scheduled_sessions, async () => {
    await db.workouts.update(workoutId, { deleted_at: t, updated_at: t });
    await db.sets
      .where('workout_id')
      .equals(workoutId)
      .modify({ deleted_at: t, updated_at: t });
    // Μια διαγραμμένη προπόνηση δεν «ολοκλήρωσε» το planned row της.
    await revertScheduledForWorkout(workoutId, t);
  });
  // Ξαναϋπολόγισε αντί να σβήσεις απλώς τις γραμμές της προπόνησης: αν αυτή
  // κρατούσε το ρεκόρ και ο «δεύτερος» δεν είχε ποτέ γραμμή (δεν ήταν PR τότε),
  // το ρεκόρ θα χανόταν εντελώς. Το recompute το ρίχνει στο αληθινό καλύτερο.
  for (const exerciseId of affectedExercises) {
    await recomputePRsForExercise(exerciseId);
  }
  if (workout) await recomputeActivityPRs(workout.activity_kind);
}

/**
 * «Αναίρεση» διαγραφής προπόνησης — επαναφέρει την προπόνηση και τα σετ της.
 * Χρειάζεται για το Undo του toast μετά από `softDeleteWorkout`: η διαγραφή
 * είναι soft (tombstone), άρα η επαναφορά είναι απλώς καθάρισμα των σημαδιών
 * — κανένα δεδομένο δεν είχε σβηστεί πραγματικά. Τα PR ξαναχτίζονται μόνα
 * τους επειδή η `recomputePRsForExercise` διαβάζει τα ζωντανά σετ.
 */
export async function restoreWorkout(workoutId: string): Promise<void> {
  const t = now();
  const workout = await db.workouts.get(workoutId);
  if (!workout || workout.deleted_at == null) return;
  const sets = await db.sets.where('workout_id').equals(workoutId).toArray();
  const affectedExercises = new Set(sets.map((s) => s.exercise_id));
  await db.transaction('rw', db.workouts, db.sets, db.scheduled_sessions, async () => {
    await db.workouts.update(workoutId, { deleted_at: null, updated_at: t });
    await db.sets.where('workout_id').equals(workoutId).modify({ deleted_at: null, updated_at: t });
    // Το softDeleteWorkout το είχε γυρίσει σε planned. Το Undo πρέπει να
    // ξανασυνδέσει το ίδιο planned row — done αν η προπόνηση είχε τελειώσει,
    // planned αν είχε διαγραφεί ενώ ήταν ακόμη ενεργή.
    await relinkScheduledForWorkout(workoutId, t, workout.ended_at != null ? 'done' : 'planned');
  });
  for (const exerciseId of affectedExercises) {
    await recomputePRsForExercise(exerciseId);
  }
  await recomputeActivityPRs(workout.activity_kind);
}

/**
 * Σβήνει μια ΟΛΟΚΛΗΡΗ άσκηση από μια προπόνηση (όλα της τα σετ μαζί).
 * Ξεχωριστά από το `softDeleteSet` γιατί ο χρήστης που πρόσθεσε λάθος
 * άσκηση δεν θέλει να πατάει delete σε κάθε σετ — ένα confirm αρκεί.
 */
export async function removeExerciseFromWorkout(
  workoutId: string,
  exerciseId: string,
): Promise<void> {
  const t = now();
  const sets = await db.sets
    .where('workout_id')
    .equals(workoutId)
    .and((s) => s.exercise_id === exerciseId && s.deleted_at == null)
    .toArray();
  if (sets.length === 0) return;
  await db.sets
    .where('workout_id')
    .equals(workoutId)
    .and((s) => s.exercise_id === exerciseId && s.deleted_at == null)
    .modify({ deleted_at: t, updated_at: t });
  await recomputePRsForExercise(exerciseId);
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

  const t = now();
  const patch: Partial<Workout> = { started_at: moved.toISOString(), updated_at: t };
  // Το ended_at μετακινείται μαζί, ώστε η διάρκεια να μείνει ίδια.
  if (w.ended_at) {
    const delta = moved.getTime() - started.getTime();
    patch.ended_at = new Date(new Date(w.ended_at).getTime() + delta).toISOString();
  }
  await db.transaction('rw', db.workouts, db.scheduled_sessions, async () => {
    await db.workouts.update(workoutId, patch);
    // Αν η προπόνηση ήταν δεμένη σε scheduled_session, το planned row πρέπει να
    // μετακινηθεί στην ίδια μέρα — αλλιώς το ημερολόγιο θα έδειχνε το planned
    // στη μία μέρα και το done workout στην άλλη. Κρατά συνέπεια date↔workout.
    await db.scheduled_sessions
      .where('user_id')
      .equals(getCurrentUserId())
      .filter((s) => s.workout_id === workoutId && s.deleted_at == null)
      .modify({ date: isoDay, updated_at: t });
  });
  // Τα PR ακολουθούν τη μέρα της προπόνησης (prAchievedAt) — μετακίνηση μέρας
  // πρέπει να τα μετακινήσει κι αυτά, αλλιώς chart και PR timeline διαφωνούν.
  await recomputePRsForWorkout(workoutId);
}

/** Ξαναϋπολογίζει τα PR όλων των ασκήσεων (και της δραστηριότητας) μιας προπόνησης. */
export async function recomputePRsForWorkout(workoutId: string): Promise<void> {
  const w = await db.workouts.get(workoutId);
  if (!w) return;
  const sets = await db.sets.where('workout_id').equals(workoutId).toArray();
  for (const exerciseId of new Set(sets.map((s) => s.exercise_id))) {
    await recomputePRsForExercise(exerciseId);
  }
  await recomputeActivityPRs(w.activity_kind);
}

/**
 * Χειροκίνητη διάρκεια προπόνησης — ο χρόνος γίνεται προαιρετικός: δεν είσαι
 * υποχρεωμένος να τρέξεις ζωντανό χρονόμετρο. Βάζεις όσα λεπτά κράτησε (ή το
 * αφήνεις κενό = χωρίς διάρκεια). Δέχεται δευτερόλεπτα· `null` καθαρίζει.
 */
export async function setWorkoutDuration(
  workoutId: string,
  seconds: number | null,
): Promise<void> {
  const value = seconds != null && Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null;
  const workout = await db.workouts.get(workoutId);
  await db.workouts.update(workoutId, { duration_seconds: value, updated_at: now() });
  // Duration feeds «longest duration» / «fastest pace» — recompute so a
  // corrected time does not leave a stale activity PR behind.
  if (workout) await recomputeActivityPRs(workout.activity_kind);
}

/**
 * Ορίζει ώρα έναρξης και/ή λήξης (HH:MM) πάνω στην ήδη υπάρχουσα ΗΜΕΡΑ.
 *
 * Το `setWorkoutDate` μετακινεί μόνο τη μέρα κρατώντας την ώρα· εδώ
 * διορθώνεις την ΩΡΑ («ξεκίνησα 18:00, όχι 20:15»). Η μέρα μένει ίδια. Αν
 * δοθεί και λήξη, επανυπολογίζεται η διάρκεια από τη διαφορά. Αν η λήξη
 * πέσει πριν την έναρξη, απορρίπτεται (επιστρέφει false) — δεν γράφουμε
 * αρνητική διάρκεια.
 */
export async function setWorkoutTimes(
  workoutId: string,
  times: { start?: string | null; end?: string | null },
): Promise<boolean> {
  const w = await db.workouts.get(workoutId);
  if (!w) return false;

  const withTime = (base: Date, hhmm: string): Date | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!m) return null;
    const hours = Number(m[1]);
    const minutes = Number(m[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    const d = new Date(base);
    d.setHours(hours, minutes, 0, 0);
    return d;
  };

  const started = new Date(w.started_at);
  const nextStart = times.start != null ? withTime(started, times.start) : null;
  if (times.start != null && nextStart == null) return false;

  const endedBase = w.ended_at ? new Date(w.ended_at) : new Date(w.started_at);
  const nextEnd = times.end != null ? withTime(endedBase, times.end) : null;
  if (times.end != null && nextEnd == null) return false;

  const finalStart = nextStart ?? started;
  const finalEnd = nextEnd ?? (w.ended_at ? new Date(w.ended_at) : null);
  if (finalEnd != null && finalEnd.getTime() < finalStart.getTime()) return false;

  const patch: Partial<Workout> = { started_at: finalStart.toISOString(), updated_at: now() };
  if (finalEnd != null) {
    patch.ended_at = finalEnd.toISOString();
    patch.duration_seconds = Math.max(0, Math.round((finalEnd.getTime() - finalStart.getTime()) / 1000));
  }
  await db.workouts.update(workoutId, patch);
  await recomputeActivityPRs(w.activity_kind);
  return true;
}

/** Αλλάζει το άθλημα μιας καταγεγραμμένης προπόνησης. */
export async function setWorkoutActivity(
  workoutId: string,
  activityKind: ActivityKind,
): Promise<void> {
  const before = await db.workouts.get(workoutId);
  await db.workouts.update(workoutId, { activity_kind: activityKind, updated_at: now() });
  if (before && before.activity_kind !== activityKind) {
    await recomputeActivityPRs(before.activity_kind);
    await recomputeActivityPRs(activityKind);
  }
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

/**
 * Έχει ποτέ καταγράψει προπόνηση; All-time — όχι παράθυρο ημερών: το «κατέγραψε
 * την πρώτη σου προπόνηση» hint δεν πρέπει να ξαναεμφανίζεται σε κάποιον που
 * έχει ιστορικό παλαιότερο από τις τελευταίες 30 μέρες. Σταματά στο πρώτο match.
 */
export async function hasAnyCompletedWorkout(): Promise<boolean> {
  const rows = await db.workouts.where('user_id').equals(getCurrentUserId()).toArray();
  return rows.some((w) => w.ended_at != null && w.deleted_at == null);
}

/* ─────────── Sets ─────────── */

export interface AddSetInput {
  workout_id: string;
  exercise_id: string;
  weight_kg: number | null;
  bodyweight_kg: number | null;
  reps: number | null;
  rest_pause_reps?: number[];
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
  let bodyweightKg = input.bodyweight_kg;
  if (bodyweightKg == null) {
    const [workout, exercise] = await Promise.all([
      db.workouts.get(input.workout_id),
      db.exercises.get(input.exercise_id),
    ]);
    if (workout && exercise?.is_bodyweight) {
      bodyweightKg = await getLatestBodyweight(localDay(new Date(workout.started_at)));
    }
  }
  const existingForExercise = await db.sets
    .where('workout_id')
    .equals(input.workout_id)
    .and((s) => s.exercise_id === input.exercise_id && s.deleted_at == null)
    .toArray();
  const nextSetNumber =
    existingForExercise.reduce((max, s) => Math.max(max, s.set_number), 0) + 1;

  const set: SetEntry = {
    id: uuid(),
    workout_id: input.workout_id,
    exercise_id: input.exercise_id,
    set_number: nextSetNumber,
    weight_kg: input.weight_kg,
    bodyweight_kg: bodyweightKg,
    reps: input.reps,
    rest_pause_reps: input.set_type === 'rest_pause' ? (input.rest_pause_reps ?? []) : [],
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
  const newPRs = isWorkingSet(set) ? await detectPRs(set, input.workout_id) : [];
  return { ...set, newPRs };
}

/**
 * Πότε «έγινε» ένα ρεκόρ. Σε live προπόνηση το `created_at` του σετ είναι η
 * πραγματική ώρα. Σε backdated/επεξεργασμένη προπόνηση όμως το σετ γράφτηκε
 * ΣΗΜΕΡΑ για μια παλιά μέρα — τότε μετρά η ημέρα της προπόνησης (started_at),
 * αλλιώς το PR timeline/streaks/dashboard βλέπουν το ρεκόρ «τώρα».
 */
function prAchievedAt(
  setCreatedAt: string,
  workout: Pick<Workout, 'started_at'> | undefined,
): string {
  if (!workout) return setCreatedAt;
  return localDay(new Date(setCreatedAt)) === localDay(new Date(workout.started_at))
    ? setCreatedAt
    : workout.started_at;
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
    .filter((r) => r.exercise_id === set.exercise_id && r.deleted_at == null)
    .toArray();
  const achievedAt = prAchievedAt(set.created_at, await db.workouts.get(workoutId));

  // Πρώτο σετ ΠΟΤΕ σε αυτή την άσκηση δεν «γιορτάζεται» ως PR — αλλιώς κάθε
  // νέα άσκηση θα έριχνε κομφετί. PR = ξεπερνάς κάτι που ΗΔΗ είχες.
  const hadHistory = existing.length > 0;

  for (const c of candidates) {
    const current = existing.find((r) => r.type === c.type) ?? null;
    if (!isNewPR(c, current)) continue;
    if (hadHistory) broken.push(c.type);
    await db.personal_records.add({
      id: uuid(),
      user_id: getCurrentUserId(),
      exercise_id: set.exercise_id,
      activity_kind: null,
      type: c.type,
      value: c.value,
      reps: c.reps,
      weight_kg: c.weight_kg,
      achieved_at: achievedAt,
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
  // Backdated: το ρεκόρ ανήκει στη μέρα της προπόνησης, όχι στο «τώρα».
  const achievedAt =
    localDay(new Date(workout.started_at)) === localDay(new Date(t)) ? t : workout.started_at;

  const records = await db.personal_records
    .where('user_id')
    .equals(getCurrentUserId())
    .filter((r) => r.activity_kind === workout.activity_kind && r.deleted_at == null)
    .toArray();

  // Exclude records whose backing workout is soft-deleted
  const existing = [];
  for (const r of records) {
    const backingWorkout = await db.workouts.get(r.workout_id);
    if (backingWorkout?.deleted_at == null) {
      existing.push(r);
    }
  }

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
      achieved_at: achievedAt,
      workout_id: workout.id,
      set_id: null,
      created_at: t,
      updated_at: t,
    });
  }
}

/**
 * Ξαναϋπολογίζει ΟΛΑ τα strength PRs μιας άσκησης από τα ζωντανά σετ.
 *
 * Γιατί χρειάζεται: το `detectPRs` τρέχει μόνο όταν ΠΡΟΣΘΕΤΕΙΣ σετ — γράφει
 * μια γραμμή κάθε φορά που ξεπερνάς το τρέχον ρεκόρ. Αν όμως διορθώσεις ένα
 * σετ προς τα κάτω (π.χ. είχες γράψει 110, ήταν 100) ή το σβήσεις, η γραμμή
 * «110» έμενε και το app συνέχιζε να λέει ψέματα. Εδώ ξαναπαράγουμε τις
 * γραμμές με την ΙΔΙΑ λογική (candidatesFromSet + isNewPR), με χρονολογική
 * σειρά, ώστε το τελικό «καλύτερο» να είναι αληθινό.
 *
 * ⚠️ SOFT delete, όχι hard — βλ. `reconcilePRs`: το sync είναι incremental με
 * tombstones μέσω `deleted_at`. Hard delete δεν στέλνει tombstone → ο server
 * κρατά για πάντα τα παλιά λάθος PR και τα ξαναφέρνει σε full pull.
 *
 * Η σειρά ακολουθεί `workout.started_at` (πότε έγινε), ώστε το history των
 * PR rows να έχει νόημα ακόμα και με backdated καταχωρίσεις. Η τιμή-ρεκόρ
 * δεν εξαρτάται από τη σειρά (max/min), μόνο το ποια γραμμή «κέρδισε πότε».
 */
export async function recomputePRsForExercise(exerciseId: string): Promise<void> {
  const uid = getCurrentUserId();
  const [allSets, workouts] = await Promise.all([
    db.sets.where('exercise_id').equals(exerciseId).toArray(),
    db.workouts.where('user_id').equals(uid).toArray(),
  ]);
  const workoutById = new Map(workouts.map((w) => [w.id, w]));

  const live = allSets
    .filter(
      (s) => isWorkingSet(s) && workoutById.get(s.workout_id)?.deleted_at == null,
    )
    .sort((a, b) => {
      const wa = workoutById.get(a.workout_id)?.started_at ?? '';
      const wb = workoutById.get(b.workout_id)?.started_at ?? '';
      return (
        wa.localeCompare(wb) ||
        a.created_at.localeCompare(b.created_at) ||
        a.set_number - b.set_number
      );
    });

  const desired: DesiredPR[] = [];
  const best = new Map<PRType, PersonalRecord>();
  for (const set of live) {
    for (const c of candidatesFromSet(set)) {
      const current = best.get(c.type) ?? null;
      if (!isNewPR(c, current)) continue;
      const row: PersonalRecord = {
        id: uuid(),
        user_id: uid,
        exercise_id: exerciseId,
        activity_kind: null,
        type: c.type,
        value: c.value,
        reps: c.reps,
        weight_kg: c.weight_kg,
        achieved_at: prAchievedAt(set.created_at, workoutById.get(set.workout_id)),
        workout_id: set.workout_id,
        set_id: set.id,
        created_at: set.created_at,
        updated_at: now(),
      };
      desired.push(row);
      best.set(c.type, row);
    }
  }

  await reconcilePRs(
    uid,
    (r) => r.exercise_id === exerciseId && r.activity_kind == null,
    desired,
  );
}

/**
 * Ξαναϋπολογίζει τα PRs δραστηριοτήτων χωρίς σετ (τρέξιμο/ποδήλατο/…).
 * Χρειάζεται όταν αλλάζει χειροκίνητα η διάρκεια ή η απόσταση μιας
 * ολοκληρωμένης προπόνησης — αλλιώς το «longest distance» παλιό μένει
 * κολλημένο. Μόνο ολοκληρωμένες, μη-διαγραμμένες, μη set-logged συμμετέχουν
 * (ίδιος κανόνας με το `endWorkout`).
 */
export async function recomputeActivityPRs(activityKind: ActivityKind): Promise<void> {
  const uid = getCurrentUserId();
  const activity = await getActivity(activityKind);
  const setLogged = activity
    ? activity.uses_sets
    : activityKind === 'strength' || activityKind === 'skill';
  if (setLogged) return;

  const workouts = (
    await db.workouts.where('user_id').equals(uid).toArray()
  )
    .filter(
      (w) =>
        w.deleted_at == null &&
        w.ended_at != null &&
        w.activity_kind === activityKind,
    )
    .sort((a, b) => a.started_at.localeCompare(b.started_at));

  const desired: DesiredPR[] = [];
  const best = new Map<PRType, PersonalRecord>();
  for (const w of workouts) {
    for (const c of candidatesFromWorkout(w)) {
      const current = best.get(c.type) ?? null;
      if (!isNewPR(c, current)) continue;
      const row: PersonalRecord = {
        id: uuid(),
        user_id: uid,
        exercise_id: null,
        activity_kind: activityKind,
        type: c.type,
        value: c.value,
        reps: c.reps,
        weight_kg: c.weight_kg,
        achieved_at: w.ended_at ?? w.started_at,
        workout_id: w.id,
        set_id: null,
        created_at: now(),
        updated_at: now(),
      };
      desired.push(row);
      best.set(c.type, row);
    }
  }

  await reconcilePRs(
    uid,
    (r) => r.activity_kind === activityKind && r.exercise_id == null,
    desired,
  );
}

/** Ένα «πρέπει να υπάρχει» PR row (το id αποφασίζεται στο reconcile). */
type DesiredPR = PersonalRecord;

/**
 * Συγχρονίζει τις ζωντανές PR γραμμές ενός scope με το «επιθυμητό» σύνολο.
 *
 * - Ό,τι υπάρχει ζωντανό και ταυτίζεται (type+set_id+value) ΚΡΑΤΙΕΤΑΙ (ίδιο
 *   id → δεν αλλάζει το wire row, δεν φουσκώνει ο server).
 * - Ό,τι ζωντανό δεν ταυτίζεται πια → SOFT delete (`deleted_at`) ώστε να φύγει
 *   tombstone στο sync και να μη ξαναζωντανέψει σε full pull. Ένα HARD delete
 *   δεν θα έστελνε tombstone και ο server θα κρατούσε τα παλιά λάθος PR για
 *   πάντα — θα επέστρεφαν σε νέα συσκευή/re-login.
 * - Ό,τι λείπει → add με νέο id.
 */
async function reconcilePRs(
  uid: string,
  scope: (r: PersonalRecord) => boolean,
  desired: DesiredPR[],
): Promise<void> {
  const t = now();
  await db.transaction('rw', db.personal_records, async () => {
    const existingLive = await db.personal_records
      .where('user_id')
      .equals(uid)
      .and((r) => r.deleted_at == null && scope(r))
      .toArray();

    // Ουρές ανά ταυτότητα, ώστε κάθε επιθυμητό να «καταναλώσει» το πολύ ένα
    // υπάρχον — άμυνα απέναντι σε διπλότυπα.
    const keyOf = (r: { type: PRType; set_id: string | null; value: number }) =>
      `${r.type}|${r.set_id ?? ''}|${r.value}`;
    const byKey = new Map<string, PersonalRecord[]>();
    for (const r of existingLive) {
      const arr = byKey.get(keyOf(r)) ?? [];
      arr.push(r);
      byKey.set(keyOf(r), arr);
    }

    const keptIds = new Set<string>();
    const toAdd: DesiredPR[] = [];
    for (const row of desired) {
      const queue = byKey.get(keyOf(row));
      const match = queue?.shift();
      if (match) {
        keptIds.add(match.id);
        // Ίδιο ρεκόρ, λάθος ημερομηνία (π.χ. αποθηκεύτηκε «τώρα» για backdated
        // προπόνηση πριν τη διόρθωση) → διορθώνεται στη θέση του, ίδιο id.
        if (match.achieved_at !== row.achieved_at) {
          await db.personal_records.update(match.id, { achieved_at: row.achieved_at, updated_at: t });
        }
      } else toAdd.push(row);
    }

    for (const r of existingLive) {
      if (!keptIds.has(r.id)) {
        await db.personal_records.update(r.id, { deleted_at: t, updated_at: t });
      }
    }
    for (const row of toAdd) {
      await db.personal_records.add(row);
    }
  });
}

/** PRs ανά άσκηση — για το UI (exercise_id → PersonalRecord[]). Μόνο strength PRs. */
export async function getPRsByExercise(): Promise<Map<string, PersonalRecord[]>> {
  const rows = await db.personal_records
    .where('user_id')
    .equals(getCurrentUserId())
    .toArray();
  const m = new Map<string, PersonalRecord[]>();
  for (const r of rows) {
    if (r.deleted_at != null || r.exercise_id == null) continue;
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
      .filter((r) => r.activity_kind === activityKind && r.deleted_at == null)
      .toArray()
  ).sort((a, b) => a.achieved_at.localeCompare(b.achieved_at));
  const m = new Map<PRType, PersonalRecord>();
  for (const r of rows) m.set(r.type, r);
  return m;
}

/** Τα πιο πρόσφατα PRs, ταξινομημένα (για History/Dashboard). */
export async function getRecentPRs(limit = 20): Promise<PersonalRecord[]> {
  const rows = (
    await db.personal_records
      .where('user_id')
      .equals(getCurrentUserId())
      .toArray()
  ).filter((r) => r.deleted_at == null);
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
      | 'rest_pause_reps'
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
  const flags =
    patch.set_type == null
      ? {}
      : {
          is_warmup: patch.set_type === 'warmup',
          is_failure: patch.set_type === 'failure',
        };
  const before = await db.sets.get(setId);
  const exerciseTouched =
    before != null &&
    (patch.weight_kg !== undefined ||
      patch.reps !== undefined ||
      patch.hold_seconds !== undefined ||
      patch.set_type !== undefined ||
      patch.rest_pause_reps !== undefined);
  await db.sets.update(setId, { ...patch, ...flags, updated_at: now() });
  // Διόρθωση βάρους/reps/hold/set_type αλλάζει το τι «άξιζε» το σετ —
  // ξαναϋπολόγισε τα ρεκόρ της άσκησης, αλλιώς παλιά PR μένουν ψευδή.
  if (exerciseTouched && before) await recomputePRsForExercise(before.exercise_id);
}

/**
 * «Επανάληψη προπόνησης» από το ιστορικό → νέα ΕΝΕΡΓΗ συνεδρία.
 *
 * Σε αντίθεση με το `startWorkoutFromLastOfKind` (τελευταία του είδους), εδώ
 * ξεκινάς από ΟΠΟΙΑΔΗΠΟΤΕ ολοκληρωμένη προπόνηση επιλέξεις. Αντιγράφει το
 * όνομα/άθλημα, αλλά ΟΧΙ τα σετ: το νέο workout ξεκινά άδειο και ο logger
 * προγεμίζει τις ασκήσεις (μέσω seedExercises στη ροή). Δεν αντιγράφει
 * ημερομηνία — ξεκινά «τώρα». Επιστρέφει null αν υπάρχει ήδη ενεργή
 * (μία ενεργή τη φορά) ή αν η πηγή δεν υπάρχει.
 */
export async function startWorkoutFromCompleted(
  workoutId: string,
): Promise<{ workout: Workout; exerciseNames: string[] } | null> {
  return withWorkoutStartGuard(async () => {
    const source = await db.workouts.get(workoutId);
    if (!source || source.deleted_at != null) return null;
    const w = await startWorkout(
      source.activity_kind,
      undefined,
      null,
      null,
      source.workout_type,
    );
    if (source.notes) {
      await db.workouts.update(w.id, { notes: source.notes, updated_at: now() });
    }
    const sets = (
      await db.sets.where('workout_id').equals(workoutId).toArray()
    )
      .filter((s) => s.deleted_at == null)
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.set_number - b.set_number);
    const names: string[] = [];
    const exercises = await db.exercises.toArray();
    const nameById = new Map(exercises.map((e) => [e.id, e.name]));
    const seen = new Set<string>();
    for (const s of sets) {
      if (seen.has(s.exercise_id)) continue;
      seen.add(s.exercise_id);
      const name = nameById.get(s.exercise_id);
      if (name) names.push(name);
    }
    return {
      workout: { ...w, notes: source.notes ?? w.notes },
      exerciseNames: names,
    };
  });
}

/**
 * Αντιγράφει μια ΟΛΟΚΛΗΡΩΜΕΝΗ προπόνηση σε άλλη ημερομηνία, με ΟΛΑ της τα σετ
 * — «ξέχασα να την καταγράψω χθες». Το αντίγραφο είναι ολοκληρωμένο workout
 * (ended_at = started + διάρκεια της πηγής, ώστε να μείνει στη σωστή μέρα και
 * να έχει σωστή διάρκεια). Νέα ids παντού, ίδιο περιεχόμενο· recompute PR για
 * τις ασκήσεις.
 * Δεν κρατά το πρόγραμμα/day link (είναι αντίγραφο, όχι νέο session προγράμματος).
 * Επιστρέφει το νέο workout id.
 */
export async function duplicateWorkoutToDate(
  sourceWorkoutId: string,
  targetDate: string,
): Promise<string | null> {
  const source = await db.workouts.get(sourceWorkoutId);
  if (!source || source.deleted_at != null) return null;
  const [y, m, d] = targetDate.split('-').map(Number);
  if (!y || !m || !d) return null;

  const sourceSets = (
    await db.sets.where('workout_id').equals(sourceWorkoutId).toArray()
  )
    .filter((s) => s.deleted_at == null)
    // Η ΣΕΙΡΑ ΑΣΚΗΣΕΩΝ στο detail βγαίνει από το created_at του πρώτου σετ κάθε
    // άσκησης (βλ. getWorkoutDetail/reorderWorkoutExercises). Γι' αυτό ταξινομούμε
    // κατά created_at (όχι μόνο set_number) και μοιράζουμε created_at = t + i ms.
    .sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.set_number - b.set_number,
    );

  const t = now();
  const tBase = Date.parse(t);
  const started = localNoon(targetDate);
  // Διατήρησε τη διάρκεια της πηγής· το ended_at = started + duration ώστε να
  // «κλείσει» και να μετράει στο ιστορικό χωρίς να παριστάνει ζωντανή συνεδρία.
  const duration = source.duration_seconds ?? 0;
  const ended = new Date(started.getTime() + Math.max(0, duration) * 1000);

  const newId = uuid();
  await db.transaction('rw', db.workouts, db.sets, async () => {
    await db.workouts.add({
      id: newId,
      user_id: getCurrentUserId(),
      started_at: started.toISOString(),
      ended_at: ended.toISOString(),
      duration_seconds: source.duration_seconds,
      notes: source.notes,
      workout_type: source.workout_type,
      activity_kind: source.activity_kind,
      program_id: null,
      program_day_id: null,
      distance_km: source.distance_km,
      feel: source.feel,
      created_at: t,
      updated_at: t,
      deleted_at: null,
    });
    for (let i = 0; i < sourceSets.length; i++) {
      const s = sourceSets[i]!;
      // Διατήρησε τη σειρά ασκήσεων: κάθε σετ παίρνει created_at = t + i ms με
      // τη σειρά της πηγής (ταξινομημένη κατά created_at). Χωρίς αυτό όλα είχαν
      // το ίδιο t → η σειρά ασκήσεων χανόταν στο αντίγραφο.
      const setCreatedAt = new Date(tBase + i).toISOString();
      await db.sets.add({
        id: uuid(),
        workout_id: newId,
        exercise_id: s.exercise_id,
        set_number: s.set_number,
        weight_kg: s.weight_kg,
        bodyweight_kg: s.bodyweight_kg,
        reps: s.reps,
        rest_pause_reps: s.rest_pause_reps ?? [],
        hold_seconds: s.hold_seconds,
        rpe: s.rpe,
        rir: s.rir,
        tempo: s.tempo,
        is_warmup: s.is_warmup,
        is_failure: s.is_failure,
        set_type: s.set_type,
        group_id: s.group_id,
        notes: s.notes,
        rest_seconds: s.rest_seconds,
        created_at: setCreatedAt,
        updated_at: t,
        deleted_at: null,
      });
    }
  });
  // Νέα σετ = νέες υποψηφιότητες PR στην ημερομηνία του αντιγράφου.
  const exerciseIds = new Set(sourceSets.map((s) => s.exercise_id));
  for (const exerciseId of exerciseIds) {
    await recomputePRsForExercise(exerciseId);
  }
  await recomputeActivityPRs(source.activity_kind);
  return newId;
}

/**
 * Αναδιατάσσει τις ασκήσεις ΜΙΑΣ προπόνησης.
 *
 * Δεν υπάρχει πεδίο θέσης ανά άσκηση-σε-workout (και δεν προσθέτουμε schema):
 * η σειρά προκύπτει από το `created_at` του πρώτου σετ κάθε άσκησης (βλ.
 * `getWorkoutDetail`). Εδώ ξαναγράφουμε τα `created_at` με βήμα 1ms στην
 * επιθυμητή σειρά, κρατώντας τη σχετική σειρά των σετ ΜΕΣΑ σε κάθε άσκηση.
 * Τα PR δεν επηρεάζονται (η τιμή είναι max/min, όχι σειρά) — και τα
 * ξαναχτίζουμε προληπτικά για σιγουριά αφού άλλαξε το `achieved_at` τους.
 */
export async function reorderWorkoutExercises(
  workoutId: string,
  orderedExerciseIds: string[],
): Promise<void> {
  const sets = (
    await db.sets.where('workout_id').equals(workoutId).toArray()
  ).filter((s) => s.deleted_at == null);
  if (sets.length === 0) return;

  const byExercise = new Map<string, SetEntry[]>();
  for (const s of sets) {
    const arr = byExercise.get(s.exercise_id) ?? [];
    arr.push(s);
    byExercise.set(s.exercise_id, arr);
  }
  const present = [...byExercise.keys()];
  const ordered = [
    ...orderedExerciseIds.filter((id) => byExercise.has(id)),
    ...present.filter((id) => !orderedExerciseIds.includes(id)),
  ];

  const base = sets.reduce(
    (min, s) => Math.min(min, Date.parse(s.created_at) || 0),
    Date.parse(sets[0]!.created_at) || Date.now(),
  );

  const touchedExercises = new Set<string>();
  await db.transaction('rw', db.sets, async () => {
    let cursor = base;
    for (const exerciseId of ordered) {
      const group = (byExercise.get(exerciseId) ?? []).sort(
        (a, b) => a.set_number - b.set_number,
      );
      for (const s of group) {
        const iso = new Date(cursor).toISOString();
        if (s.created_at !== iso) {
          await db.sets.update(s.id, { created_at: iso });
          touchedExercises.add(exerciseId);
        }
        cursor += 1;
      }
    }
  });
  for (const exerciseId of touchedExercises) {
    await recomputePRsForExercise(exerciseId);
  }
}

/**
 * Ξαναριθμεί τα ΖΩΝΤΑΝΑ σετ μιας άσκησης σε 1..N με βάση την τρέχουσα σειρά
 * τους (set_number, με created_at tiebreak). Χωρίς αυτό, όταν φεύγει/μπαίνει
 * σετ από μια άσκηση μένει «κενό» (π.χ. #1, #3) — μοιάζει σαν να χάθηκε σετ.
 * Επιστρέφει τα ids που άλλαξαν (για recompute PR αν χρειάζεται).
 */
export async function renumberSetsForExercise(
  workoutId: string,
  exerciseId: string,
): Promise<string[]> {
  const live = (
    await db.sets
      .where('workout_id')
      .equals(workoutId)
      .and((s) => s.exercise_id === exerciseId && s.deleted_at == null)
      .toArray()
  ).sort((a, b) => a.set_number - b.set_number || a.created_at.localeCompare(b.created_at));

  const changed: string[] = [];
  for (let i = 0; i < live.length; i++) {
    const want = i + 1;
    if (live[i]!.set_number !== want) {
      await db.sets.update(live[i]!.id, { set_number: want, updated_at: now() });
      changed.push(live[i]!.id);
    }
  }
  return changed;
}

/**
 * Μεταφέρει ένα σετ σε άλλη άσκηση — «το έγραψα σε λάθος άσκηση».
 *
 * Ο set_number ξαναϋπολογίζεται ώστε να μπει στο τέλος της νέας άσκησης, και
 * ΞΑΝΑΡΙΘΜΟΥΝΤΑΙ και οι δύο ασκήσεις (Bug L1: πριν έμενε κενό στην αρχική,
 * π.χ. #1,#3). Τα ρεκόρ και των ΔΥΟ ασκήσεων ξαναχτίζονται.
 */
export async function moveSetToExercise(setId: string, exerciseId: string): Promise<void> {
  const set = await db.sets.get(setId);
  if (!set || set.exercise_id === exerciseId) return;
  const previousExerciseId = set.exercise_id;
  const workoutId = set.workout_id;
  const targetSets = await db.sets
    .where('workout_id')
    .equals(workoutId)
    .and((s) => s.exercise_id === exerciseId && s.deleted_at == null && s.id !== setId)
    .toArray();
  const nextNumber = targetSets.reduce((max, s) => Math.max(max, s.set_number), 0) + 1;
  await db.transaction('rw', db.sets, async () => {
    await db.sets.update(setId, {
      exercise_id: exerciseId,
      set_number: nextNumber,
      updated_at: now(),
    });
    // Bug L1: η αρχική άσκηση θα είχε κενό (π.χ. μετά το #2 έμενε #1, #3).
    // Ξαναρίθμησε ΚΑΙ τις δύο ώστε η σειρά να είναι πυκνή 1..N.
    await renumberSetsForExercise(workoutId, previousExerciseId);
    await renumberSetsForExercise(workoutId, exerciseId);
  });
  await recomputePRsForExercise(previousExerciseId);
  await recomputePRsForExercise(exerciseId);
}

/**
 * Αλλάζει το βάρος (προστιθέμενο kg) σε ΟΛΑ τα ζωντανά σετ μιας άσκησης σε μια
 * προπόνηση — «ήταν 20kg, όχι 25». Χρήσιμο όταν γράφτηκε λάθος βάρος σε όλη τη
 * σειρά. Το `deltaKg` προστίθεται (θετικό/αρνητικό)· `absoluteKg` θέτει σταθερό
 * βάρος. Αγνοεί warm-ups (δεν θέλεις να αλλάξεις το ζέσταμα) και σετ χωρίς
 * βάρος. Ξαναϋπολογίζει PR μετά.
 */
export async function adjustExerciseSetWeights(
  workoutId: string,
  exerciseId: string,
  change: { deltaKg?: number; absoluteKg?: number },
): Promise<{ updated: number }> {
  const t = now();
  const sets = await db.sets
    .where('workout_id')
    .equals(workoutId)
    .and((s) => s.exercise_id === exerciseId && s.deleted_at == null)
    .toArray();
  const targets = sets.filter((s) => isWorkingSet(s) && s.weight_kg != null);
  if (targets.length === 0) return { updated: 0 };

  let updated = 0;
  await db.transaction('rw', db.sets, async () => {
    for (const s of targets) {
      const base = s.weight_kg!;
      const next =
        change.absoluteKg != null
          ? change.absoluteKg
          : base + (change.deltaKg ?? 0);
      const clamped = Math.max(0, Math.round(next * 100) / 100);
      if (clamped === base) continue;
      await db.sets.update(s.id, { weight_kg: clamped, updated_at: t });
      updated += 1;
    }
  });
  if (updated > 0) await recomputePRsForExercise(exerciseId);
  return { updated };
}

/**
 * «Τι έκανα την τελευταία φορά σε αυτή την άσκηση» — για auto-fill του logger.
 * Το πιο πρόσφατο ΜΗ-warmup σετ· τα ζεστάματα δεν είναι απόδοση προς επανάληψη.
 */
export async function getLastPerformance(
  exerciseId: string,
  opts: { excludeWorkoutId?: string } = {},
): Promise<{
  weight_kg: number | null;
  reps: number | null;
  hold_seconds: number | null;
  bodyweight_kg: number | null;
  achieved_at: string;
} | null> {
  const workouts = await db.workouts.where('user_id').equals(getCurrentUserId()).toArray();
  const visibleWorkoutIds = new Set(
    workouts
      .filter((w) => w.deleted_at == null && w.id !== opts.excludeWorkoutId)
      .map((w) => w.id),
  );
  const rows = await db.sets
    .where('exercise_id')
    .equals(exerciseId)
    .filter((s) => isWorkingSet(s) && visibleWorkoutIds.has(s.workout_id))
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
export interface BodyweightLoad {
  exerciseId: string;
  name: string;
  loadKg: number;
  date: string;
}

/**
 * Τελευταίο συνολικό φορτίο για κάθε άσκηση σωματικού βάρους:
 * σωματικό βάρος + πρόσθετο βάρος, όπως ακριβώς το μετρά το progress chart.
 * Χρησιμοποιείται στο «Σώμα» για να φαίνεται πώς το BW τροφοδοτεί τα charts.
 */
export async function getBodyweightLoads(limit = 5): Promise<BodyweightLoad[]> {
  const exercises = (await listExercises()).filter((e) => e.is_bodyweight);
  if (exercises.length === 0) return [];
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const workouts = await db.workouts.where('user_id').equals(getCurrentUserId()).toArray();
  const dayByWorkout = new Map(
    workouts
      .filter((w) => w.deleted_at == null)
      .map((w) => [w.id, localDay(new Date(w.started_at))]),
  );
  const sets = (
    await db.sets.where('exercise_id').anyOf([...byId.keys()]).toArray()
  ).filter(isWorkingSet);
  const latest = new Map<string, BodyweightLoad>();
  for (const s of sets) {
    const date = dayByWorkout.get(s.workout_id);
    if (!date) continue;
    const loadKg = (s.weight_kg ?? 0) + (s.bodyweight_kg ?? 0);
    if (loadKg <= 0) continue;
    const ex = byId.get(s.exercise_id);
    if (!ex) continue;
    const cur = latest.get(ex.id);
    if (!cur || date > cur.date || (date === cur.date && loadKg > cur.loadKg)) {
      latest.set(ex.id, { exerciseId: ex.id, name: ex.name, loadKg, date });
    }
  }
  return [...latest.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

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
  const set = await db.sets.get(setId);
  await db.sets.update(setId, { deleted_at: t, updated_at: t });
  // Σβήσιμο σετ αφήνει κενό στη σειρά (#1, #3) — ξαναρίθμησε τα υπόλοιπα.
  if (set) await renumberSetsForExercise(set.workout_id, set.exercise_id);
  // Σβήσιμο σετ μπορεί να αφαιρεί το μόνο σετ που είχε σπάσει ένα ρεκόρ —
  // τα PR πρέπει να πέσουν πίσω στο αληθινό καλύτερο, όχι να μείνουν.
  if (set) await recomputePRsForExercise(set.exercise_id);
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
  return all.filter(
    (s) => s.deleted_at == null && isVisibleToMe(s) && (includeArchived || !s.is_archived),
  );
}

/** Ένα skill μαζί με τα βήματά του, ταξινομημένα. */
export async function getSkillWithSteps(skillId: string) {
  const [skill, steps] = await Promise.all([
    db.skills.get(skillId),
    db.skill_steps.where('skill_id').equals(skillId).sortBy('step_number'),
  ]);
  if (!skill || skill.deleted_at != null) return null;
  return { skill, steps: steps.filter((s) => s.deleted_at == null) };
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
    rows
      .filter((r) => r.deleted_at == null && wanted.has(r.skill_step_id))
      .map((r) => [r.skill_step_id, r]),
  );
}

export async function getSkillProgress(
  skillId: string,
): Promise<UserSkillProgress | undefined> {
  const row = await db.user_skill_progress
    .where('[user_id+skill_id]')
    .equals([getCurrentUserId(), skillId])
    .first();
  return row?.deleted_at == null ? row : undefined;
}

/** Πρόοδος για ΟΛΑ τα skills — για τη λίστα (skill_id → progress). */
export async function getAllSkillProgress(): Promise<Map<string, UserSkillProgress>> {
  const rows = await db.user_skill_progress
    .where('user_id')
    .equals(getCurrentUserId())
    .toArray();
  return new Map(rows.filter((r) => r.deleted_at == null).map((r) => [r.skill_id, r]));
}

async function upsertProgress(
  skillId: string,
  patch: Partial<UserSkillProgress>,
): Promise<void> {
  const t = now();
  // Το unique [user_id+skill_id] μπορεί να κρατά TOMBSTONE (π.χ. μετά από
  // wipe/delete profile) — πρέπει να το αναστήσουμε, όχι να κάνουμε add.
  const existing = await db.user_skill_progress
    .where('[user_id+skill_id]')
    .equals([getCurrentUserId(), skillId])
    .first();
  if (existing) {
    await db.user_skill_progress.update(existing.id, {
      ...patch,
      updated_at: t,
      deleted_at: null,
    });
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
  addedWeightKg: number | null = null,
): Promise<void> {
  const t = now();
  const steps = (await db.skill_steps.where('skill_id').equals(skillId).sortBy('step_number'))
    .filter((s) => s.deleted_at == null);
  const idx = steps.findIndex((s) => s.id === stepId);
  if (idx === -1) return;

  const already = await db.user_skill_step_completions
    .where('user_id')
    .equals(getCurrentUserId())
    .filter((r) => r.skill_step_id === stepId && r.deleted_at == null)
    .first();

  if (!already) {
    await db.user_skill_step_completions.add({
      id: uuid(),
      user_id: getCurrentUserId(),
      skill_step_id: stepId,
      achieved_value: achievedValue,
      added_weight_kg: addedWeightKg,
      achieved_at: t,
      workout_id: null,
      notes: null,
      created_at: t,
      updated_at: t,
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
  const t = now();
  const rows = await db.user_skill_step_completions
    .where('user_id')
    .equals(getCurrentUserId())
    .filter((r) => r.skill_step_id === stepId && r.deleted_at == null)
    .toArray();
  // Tombstone, όχι hard delete: αλλιώς η αναίρεση δεν φτάνει ποτέ σε άλλη
  // συσκευή (ο server βλέπει deletion από το deleted_at, βλ. sync.rs).
  await Promise.all(
    rows.map((r) =>
      db.user_skill_step_completions.update(r.id, { deleted_at: t, updated_at: t }),
    ),
  );
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
  /** XP από events των τελευταίων 7 ημερών — για το weekly leaderboard. */
  weekXp: number;
}> {
  const uid = getCurrentUserId();
  const [workouts, prs, insights, skillStats, progress, completions] = await Promise.all([
    listCompletedWorkouts(),
    db.personal_records
      .where('user_id')
      .equals(uid)
      .filter((r) => r.deleted_at == null)
      .toArray(),
    getTrainingInsights(30),
    getSkillStepStats(),
    getAllSkillProgress(),
    db.user_skill_step_completions
      .where('user_id')
      .equals(uid)
      .filter((c) => c.deleted_at == null)
      .toArray(),
  ]);
  // Τα sets ανήκουν μέσω workout_id (δεν έχουν δικό τους user_id index) —
  // παίρνουμε μόνο όσα ανήκουν σε ΔΙΚΕΣ σου ολοκληρωμένες προπονήσεις.
  const completedIds = workouts.map((w) => w.id);
  const sets = await db.sets.where('workout_id').anyOf(completedIds).toArray();
  const totalSets = sets.filter(isWorkingSet).length;
  const masteredSteps = [...skillStats.values()].reduce((sum, s) => sum + s.done, 0);
  const masteredSkills = [...progress.values()].filter((p) => p.status === 'mastered').length;

  // Rolling 7-day window (σήμερα + 6 προηγούμενες ημέρες), τοπικά μεσάνυχτα.
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const inWeek = (iso: string) => new Date(iso) >= weekStart;
  const weekWorkoutIds = new Set(
    workouts.filter((w) => inWeek(w.started_at)).map((w) => w.id),
  );
  const weekSets = sets.filter(
    (s) => weekWorkoutIds.has(s.workout_id) && isWorkingSet(s),
  ).length;
  const weekPrs = prs.filter((p) => inWeek(p.achieved_at)).length;
  // Ένα βήμα μπορεί να ξανακατακτηθεί μετά από reset· μετρά μία φορά/εβδομάδα.
  const weekStepIds = new Set(
    completions.filter((c) => inWeek(c.achieved_at)).map((c) => c.skill_step_id),
  );
  const totalXpValue =
    workouts.length * 100 + totalSets * 5 + prs.length * 50 + masteredSteps * 40;
  const weekXp = Math.min(
    weekWorkoutIds.size * 100 + weekSets * 5 + weekPrs * 50 + weekStepIds.size * 40,
    totalXpValue,
  );

  return {
    completedWorkouts: workouts.length,
    totalSets,
    prCount: prs.length,
    masteredSteps,
    masteredSkills,
    streakDays: insights.streakDays,
    longestStreakDays: insights.longestStreakDays,
    weekXp,
  };
}

export async function getSkillStepStats(): Promise<Map<string, { total: number; done: number }>> {
  const visibleSkillIds = new Set((await listSkills(true)).map((s) => s.id));
  const [steps, completions] = await Promise.all([
    db.skill_steps.toArray(),
    db.user_skill_step_completions.where('user_id').equals(getCurrentUserId()).toArray(),
  ]);
  const stepToSkill = new Map(
    steps
      .filter((s) => s.deleted_at == null && visibleSkillIds.has(s.skill_id))
      .map((s) => [s.id, s.skill_id]),
  );

  const out = new Map<string, { total: number; done: number }>();
  for (const skillId of stepToSkill.values()) {
    const cur = out.get(skillId) ?? { total: 0, done: 0 };
    cur.total += 1;
    out.set(skillId, cur);
  }
  for (const c of completions) {
    if (c.deleted_at != null) continue;
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
  programs: db.programs, program_days: db.program_days, program_exercises: db.program_exercises,
  activities: db.activities, goals: db.goals,
  custom_trackers: db.custom_trackers, custom_tracker_entries: db.custom_tracker_entries,
  scheduled_sessions: db.scheduled_sessions,
});

/**
 * Backup/restore μετακόμισαν στο `./backup` (το queries.ts κάθεται στο όριο του
 * oxc parser — νέος κώδικας εδώ σπάει το vitest transform). Re-exported ώστε οι
 * παλιοί καταναλωτές (`@/lib/db/queries`) να μη χρειαστεί να αλλάξουν import.
 */
export { exportAll, exportProfile, importAll, previewImport } from './backup';
export type { ImportResult, ImportPreview, BackupScope } from './backup';

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
    (s) => isWorkingSet(s) && byId.has(s.workout_id),
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
    // Unique [user_id+date]: ένα tombstone ανασταίνεται αντί να σπάσει το add.
    await db.body_metrics.update(existing.id, { ...patch, updated_at: t, deleted_at: null });
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
    waist_cm: null,
    chest_cm: null,
    hips_cm: null,
    arm_cm: null,
    forearm_cm: null,
    thigh_cm: null,
    calf_cm: null,
    neck_cm: null,
    notes: null,
    created_at: t,
    updated_at: t,
    ...patch,
  });
}

export async function getBodyMetric(date: string): Promise<BodyMetric | undefined> {
  const row = await db.body_metrics
    .where('[user_id+date]')
    .equals([getCurrentUserId(), date])
    .first();
  return row && row.deleted_at == null ? normalizeBodyMetric(row) : undefined;
}

/**
 * Περιφέρειες Wave 4 — normalize σε `null` όπου το row είναι παλιό (δεν είχε
 * καθόλου τα πεδία). Χωρίς αυτό, ένα row χωρίς `waist_cm` δίνει `undefined` και
 * το UI (input value, chart) βλέπει «σπασμένη» τιμή αντί για «κενό».
 */
function normalizeBodyMetric(row: BodyMetric): BodyMetric {
  return {
    ...row,
    waist_cm: row.waist_cm ?? null,
    chest_cm: row.chest_cm ?? null,
    hips_cm: row.hips_cm ?? null,
    arm_cm: row.arm_cm ?? null,
    forearm_cm: row.forearm_cm ?? null,
    thigh_cm: row.thigh_cm ?? null,
    calf_cm: row.calf_cm ?? null,
    neck_cm: row.neck_cm ?? null,
  };
}

/**
 * Το πιο πρόσφατο καταγεγραμμένο σωματικό βάρος έως (και) μια ημερομηνία.
 *
 * Γιατί υπάρχει: ένα σετ σε άσκηση σωματικού βάρους (έλξεις, βυθίσεις,
 * planche) έχει πραγματικό φορτίο = σωματικό βάρος + πρόσθετο. Ο logger
 * «φωτογραφίζει» εδώ το βάρος της στιγμής ώστε τα charts (total load / e1RM /
 * όγκος) να λένε την αλήθεια — το βάρος αλλάζει σε βάθος μηνών, οπότε κρατάμε
 * την τιμή ΤΟΤΕ, όχι τη σημερινή. `null` αν δεν έχει καταγραφεί ποτέ βάρος.
 */
export async function getLatestBodyweight(onOrBeforeDate?: string): Promise<number | null> {
  const cutoff = onOrBeforeDate ?? localDay();
  const rows = await db.body_metrics.where('user_id').equals(getCurrentUserId()).toArray();
  const candidates = rows
    .filter((r) => r.deleted_at == null && r.weight_kg != null && r.date <= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date));
  return candidates[0]?.weight_kg ?? null;
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
      await db.body_metrics.update(existing.id, { ...patch, updated_at: t, deleted_at: null });
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
        waist_cm: null,
        chest_cm: null,
        hips_cm: null,
        arm_cm: null,
        forearm_cm: null,
        thigh_cm: null,
        calf_cm: null,
        neck_cm: null,
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
  /** Περιφέρειες (cm αποθηκευμένα) — null όταν δεν καταγράφηκαν. */
  waistCm: number | null;
  chestCm: number | null;
  hipsCm: number | null;
  armCm: number | null;
  forearmCm: number | null;
  thighCm: number | null;
  calfCm: number | null;
  neckCm: number | null;
}

/**
 * Χρονοσειρά βάρους, θερμίδων & σύστασης σώματος. Οι τιμές αφήνονται `null`
 * στις μέρες χωρίς καταγραφή (το chart τις γεφυρώνει) — δεν εφευρίσκουμε τιμές.
 */
export async function getBodyTrend(days = 60): Promise<BodyPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const rows = (await db.body_metrics.where('user_id').equals(getCurrentUserId()).toArray())
    .filter((r) => r.deleted_at == null);
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
      waistCm: r?.waist_cm ?? null,
      chestCm: r?.chest_cm ?? null,
      hipsCm: r?.hips_cm ?? null,
      armCm: r?.arm_cm ?? null,
      forearmCm: r?.forearm_cm ?? null,
      thighCm: r?.thigh_cm ?? null,
      calfCm: r?.calf_cm ?? null,
      neckCm: r?.neck_cm ?? null,
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
  /** reps του top-weight σετ (για το «× reps» δίπλα στο φορτίο) */
  reps: number | null;
  /** Περισσότερες reps σε ένα σετ της ημέρας — ανεξάρτητα από φορτίο (push-ups). */
  maxReps: number | null;
  /** Μεγαλύτερο hold (sec) της ημέρας — static ασκήσεις (planche, L-sit…). */
  hold: number | null;
  /**
   * true = κάποιο σετ της ημέρας δεν είχε καταγεγραμμένο σωματικό βάρος και το
   * φορτίο υπολογίστηκε με το πιο πρόσφατο βάρος σώματος ΜΕΧΡΙ εκείνη τη μέρα.
   */
  bwEstimated?: boolean;
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
  ).filter((s) => isWorkingSet(s) && wDay.has(s.workout_id));

  // Ασκήσεις σωματικού βάρους: σετ χωρίς καταγεγραμμένο βάρος (π.χ. πριν
  // μετρηθεί ποτέ) παίρνουν το πιο πρόσφατο σωματικό βάρος ΜΕΧΡΙ εκείνη την
  // ημέρα — ποτέ από το μέλλον. Χωρίς καμία μέτρηση μένει το added load.
  const exercise = await db.exercises.get(exerciseId);
  const bwHistory = exercise?.is_bodyweight
    ? (await db.body_metrics.where('user_id').equals(getCurrentUserId()).toArray())
        .filter((r) => r.deleted_at == null && r.weight_kg != null)
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const bodyweightOn = (day: string): number | null => {
    let found: number | null = null;
    for (const r of bwHistory) {
      if (r.date > day) break;
      found = r.weight_kg;
    }
    return found;
  };

  const byDay = new Map<string, ExercisePoint>();
  for (const s of sets) {
    const day = wDay.get(s.workout_id)!;
    const cur =
      byDay.get(day) ??
      ({ date: day, topWeight: null, e1rm: null, volume: 0, reps: null, maxReps: null, hold: null } as ExercisePoint);
    let bw = s.bodyweight_kg ?? 0;
    if (s.bodyweight_kg == null && bwHistory.length > 0) {
      const fb = bodyweightOn(day);
      if (fb != null) {
        bw = fb;
        cur.bwEstimated = true;
      }
    }
    const load = (s.weight_kg ?? 0) + bw;
    if (load > 0 && (cur.topWeight == null || load > cur.topWeight)) {
      cur.topWeight = load;
      cur.reps = s.reps;
    }
    if (s.reps && load > 0) {
      const est = e1rm(load, s.reps);
      if (cur.e1rm == null || est > cur.e1rm) cur.e1rm = Math.round(est * 10) / 10;
    }
    if (s.reps && s.reps > 0 && (cur.maxReps == null || s.reps > cur.maxReps)) {
      cur.maxReps = s.reps;
    }
    if (s.hold_seconds && s.hold_seconds > 0 && (cur.hold == null || s.hold_seconds > cur.hold)) {
      cur.hold = s.hold_seconds;
    }
    cur.volume += setVolume({ ...s, bodyweight_kg: s.bodyweight_kg ?? (bw > 0 ? bw : null) });
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
    db.body_metrics
      .where('user_id')
      .equals(getCurrentUserId())
      .filter((m) => m.deleted_at == null)
      .toArray(),
  ]);
  const setCount = new Map<string, number>();
  for (const s of allSets) {
    if (s.deleted_at != null) continue;
    setCount.set(s.workout_id, (setCount.get(s.workout_id) ?? 0) + 1);
  }
  const weightBy = new Map(metrics.map((m) => [m.date, m.weight_kg]));

  const out = new Map<string, DayActivities>();
  for (const w of workouts) {
    // Μόνο ολοκληρωμένες — αλλιώς μια εγκαταλειμμένη/ενεργή προπόνηση φούσκωνε
    // τα month stats και διαφωνούσε με το Ιστορικό.
    if (w.deleted_at != null || w.ended_at == null) continue;
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

export interface WorkoutSummary {
  workout: Workout;
  setCount: number;
  volume: number;
  /** Η άσκηση με τα περισσότερα σετ — δίνει μια «ματιά» στη σύνθεση. */
  topExercise: string | null;
  /** Όλες οι ασκήσεις που εμφανίστηκαν — για φίλτρο ιστορικού ανά άσκηση. */
  exerciseIds: string[];
}

/**
 * Το ιστορικό με αρκετά για να αναγνωρίσεις μια προπόνηση χωρίς να την ανοίξεις:
 * σετ, όγκος, κυρίαρχη άσκηση — αντί για μόνο ημερομηνία/διάρκεια. Μία σάρωση
 * σετ, όχι N ερωτήματα ανά προπόνηση.
 */
export async function listWorkoutSummaries(): Promise<WorkoutSummary[]> {
  const [workouts, allSets, exercises] = await Promise.all([
    db.workouts.where('user_id').equals(getCurrentUserId()).toArray(),
    db.sets.toArray(),
    listAllExercises(),
  ]);
  const nameById = new Map(exercises.map((e) => [e.id, e.name]));
  const agg = new Map<string, { setCount: number; volume: number; byExercise: Map<string, number> }>();
  for (const s of allSets) {
    if (!isWorkingSet(s)) continue;
    const cur = agg.get(s.workout_id) ?? { setCount: 0, volume: 0, byExercise: new Map() };
    cur.setCount += 1;
    cur.volume += setVolume(s);
    cur.byExercise.set(s.exercise_id, (cur.byExercise.get(s.exercise_id) ?? 0) + 1);
    agg.set(s.workout_id, cur);
  }
  return workouts
    .filter((w) => w.ended_at != null && w.deleted_at == null)
    .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''))
    .map((w) => {
      const a = agg.get(w.id);
      let topExercise: string | null = null;
      if (a && a.byExercise.size > 0) {
        const [topId] = [...a.byExercise.entries()].sort((x, y) => y[1] - x[1])[0]!;
        topExercise = nameById.get(topId) ?? null;
      }
      return {
        workout: w,
        setCount: a?.setCount ?? 0,
        volume: Math.round(a?.volume ?? 0),
        topExercise,
        exerciseIds: a ? [...a.byExercise.keys()] : [],
      };
    });
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
      // Δένουμε με το program_id, όχι με το όνομα: οι μέρες γράφουν workout_type
      // «<μέρα> #N» (ποτέ == program.name → πάντα 0) και η μετονομασία το έσπαγε.
      w.program_id === programId &&
      w.started_at >= weekStart,
  ).length;

  return { target: program.target_sessions_per_week, completedThisWeek };
}

export async function renameProgram(id: string, name: string): Promise<void> {
  await db.programs.update(id, { name, updated_at: now() });
}

/** Περιγραφή προγράμματος — κενό string αποθηκεύεται ως null (όχι ''). */
export async function setProgramDescription(id: string, description: string): Promise<void> {
  const trimmed = description.trim();
  await db.programs.update(id, {
    description: trimmed === '' ? null : trimmed,
    updated_at: now(),
  });
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
  return program ? { program, exercises: rows.filter((r) => r.deleted_at == null) } : null;
}

export interface ProgramExerciseInput {
  exercise_id: string;
  program_day_id?: string | null;
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
  const position = (await db.program_exercises.where('program_id').equals(programId).toArray())
    .filter((r) => r.deleted_at == null).length;
  const row: ProgramExercise = {
    id: uuid(),
    program_id: programId,
    program_day_id: input.program_day_id ?? null,
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
    program_day_id: null,
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
  // Soft delete: ένα hard delete δεν αφήνει tombstone, άρα η διαγραφή δεν
  // έφτανε ποτέ σε άλλη συσκευή — και μπορούσε να «αναστηθεί» σε cursor reset.
  const t = now();
  await db.program_exercises.update(id, { deleted_at: t, updated_at: t });
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
 * Μία ενεργή προπόνηση τη φορά, ακόμα και με διπλό tap: το boolean κλείνει
 * synchronously πριν το πρώτο await, οπότε το δεύτερο call βλέπει lock.
 */
let workoutStartLock = false;

async function withWorkoutStartGuard<T>(start: () => Promise<T>): Promise<T | null> {
  if (workoutStartLock) return null;
  workoutStartLock = true;
  try {
    if (await getActiveWorkout()) return null;
    return await start();
  } finally {
    workoutStartLock = false;
  }
}

/**
 * Ξεκινά workout από πρόγραμμα. ΔΕΝ γράφει σετ — ένα σετ σημαίνει «το έκανα».
 * Το πλάνο επιστρέφεται ώστε ο logger να δείξει τους στόχους προς εκτέλεση.
 */
export async function startWorkoutFromProgram(programId: string, onDate?: string) {
  return withWorkoutStartGuard(async () => {
    const data = await getProgramWithExercises(programId);
    if (!data) return null;
    const w = await startWorkout(
      data.program.activity_kind,
      onDate,
      programId,
      null,
      data.program.name,
    );
    return { workout: w, plan: data.exercises };
  });
}

/* ─────────── Program days (v12: πρόγραμμα → μέρες → ασκήσεις) ─────────── */

export async function listProgramDays(programId: string): Promise<ProgramDay[]> {
  const rows = await db.program_days.where('program_id').equals(programId).sortBy('position');
  return rows.filter((d) => d.deleted_at == null);
}

export async function createProgramDay(programId: string, name: string): Promise<ProgramDay> {
  const t = now();
  // Θέση μετά την τελευταία ΖΩΝΤΑΝΗ μέρα — οι διαγραμμένες δεν πιάνουν θέση.
  const position = (await listProgramDays(programId)).length;
  const day: ProgramDay = {
    id: uuid(),
    program_id: programId,
    name: name.trim(),
    position,
    created_at: t,
    updated_at: t,
  };
  await db.program_days.add(day);
  return day;
}

export async function renameProgramDay(dayId: string, name: string): Promise<void> {
  await db.program_days.update(dayId, { name: name.trim(), updated_at: now() });
}

export async function reorderProgramDays(_programId: string, orderedIds: string[]): Promise<void> {
  const t = now();
  await db.transaction('rw', db.program_days, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.program_days.update(orderedIds[i]!, { position: i, updated_at: t });
    }
  });
}

/** Σβήνει μέρα + τις ασκήσεις της (οι ασκήσεις ανήκουν στη μέρα, δεν μένουν ορφανές). */
export async function deleteProgramDay(dayId: string): Promise<void> {
  // Soft delete και για τη μέρα και για τις ασκήσεις της — και τα δύο
  // συγχρονίζονται, άρα και τα δύο χρειάζονται tombstone.
  const t = now();
  await db.transaction('rw', db.program_days, db.program_exercises, async () => {
    await db.program_exercises
      .where('program_day_id')
      .equals(dayId)
      .modify({ deleted_at: t, updated_at: t });
    await db.program_days.update(dayId, { deleted_at: t, updated_at: t });
  });
}

export async function getProgramDayWithExercises(dayId: string) {
  const [day, rows] = await Promise.all([
    db.program_days.get(dayId),
    db.program_exercises.where('[program_day_id+position]').between([dayId, -Infinity], [dayId, Infinity]).toArray(),
  ]);
  if (!day || day.deleted_at != null) return null;
  return {
    day,
    exercises: rows.filter((r) => r.deleted_at == null).sort((a, b) => a.position - b.position),
  };
}

/** Πόσες ΟΛΟΚΛΗΡΩΜΕΝΕΣ προπονήσεις έχεις κάνει με αυτή τη μέρα — για «3η Upper day». */
export async function countProgramDaySessions(dayId: string): Promise<number> {
  const rows = await db.workouts.where('program_day_id').equals(dayId).toArray();
  return rows.filter((w) => w.deleted_at == null && w.ended_at != null).length;
}

/** Ξεκινά προπόνηση από μέρα προγράμματος — linked (auto-numbering) + pre-filled plan. */
export async function startWorkoutFromProgramDay(dayId: string, onDate?: string) {
  return withWorkoutStartGuard(async () => {
    const data = await getProgramDayWithExercises(dayId);
    if (!data) return null;
    const program = await db.programs.get(data.day.program_id);
    const kind = program?.activity_kind ?? 'strength';
    const sessionNo = (await countProgramDaySessions(dayId)) + 1;
    const label = `${data.day.name} #${sessionNo}`;
    const w = await startWorkout(kind, onDate, data.day.program_id, dayId, label);
    return {
      workout: { ...w, program_id: data.day.program_id, program_day_id: dayId },
      plan: data.exercises,
      sessionNo,
    };
  });
}

/** Ad-hoc/random προπόνηση — καμία σύνδεση με πρόγραμμα (mini/quick/for-fun). */
export async function startAdHocWorkout(
  activityKind: ActivityKind = 'strength',
  onDate?: string,
  workoutType?: string | null,
): Promise<{ workout: Workout; plan: ProgramExercise[] } | null> {
  return withWorkoutStartGuard(async () => {
    const w = await startWorkout(activityKind, onDate, null, null, workoutType);
    return { workout: w, plan: [] as ProgramExercise[] };
  });
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
  if (data.program.target_sessions_per_week != null) {
    await db.programs.update(copy.id, {
      target_sessions_per_week: data.program.target_sessions_per_week,
      updated_at: now(),
    });
  }
  // Αντιγράφουμε τις ΜΕΡΕΣ (νέα ids) και κρατάμε χάρτη παλιό→νέο, ώστε οι
  // ασκήσεις να μείνουν στη μέρα τους — αλλιώς το «save as template»/reuse
  // ισοπέδωνε κάθε δομημένο πρόγραμμα σε flat.
  const dayMap = new Map<string, string>();
  for (const d of await listProgramDays(programId)) {
    const nd = await createProgramDay(copy.id, d.name);
    dayMap.set(d.id, nd.id);
  }
  for (const row of data.exercises) {
    await addProgramExercise(copy.id, {
      exercise_id: row.exercise_id,
      program_day_id: row.program_day_id != null ? (dayMap.get(row.program_day_id) ?? null) : null,
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
    isWorkingSet,
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
  const workout = await db.workouts.get(workoutId);
  await db.workouts.update(workoutId, { distance_km: km, updated_at: now() });
  if (workout) await recomputeActivityPRs(workout.activity_kind);
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

/**
 * Πόσα ιστορικά δεδομένα «κρέμονται» από μια άσκηση: σετ, PR, γραμμές
 * προγράμματος, στόχοι. Το UI το χρησιμοποιεί για να μπλοκάρει τη διαγραφή
 * (με μήνυμα «χρησιμοποιείται») αντί να σπάσει το ιστορικό.
 */
export async function countExerciseUsage(id: string): Promise<{
  sets: number;
  prs: number;
  programs: number;
  goals: number;
  total: number;
}> {
  const [sets, prs, programs, goals] = await Promise.all([
    db.sets.where('exercise_id').equals(id).count(),
    db.personal_records.where('exercise_id').equals(id).count(),
    db.program_exercises.where('exercise_id').equals(id).filter((r) => r.deleted_at == null).count(),
    db.goals.where('exercise_id').equals(id).filter((g) => g.deleted_at == null).count(),
  ]);
  return { sets, prs, programs, goals, total: sets + prs + programs + goals };
}

/**
 * Διαγραφή ΔΙΚΗΣ ΣΟΥ άσκησης (soft delete). Builtin (`user_id === null`) δεν
 * διαγράφονται — μόνο αρχειοθετούνται. Αν η άσκηση έχει ιστορικό, επιστρέφει
 * `{ blocked: true, usage }` και δεν διαγράφει τίποτα: το ιστορικό δεν σπάει,
 * ο χρήστης πρέπει να τη συγχωνεύσει ή να την αρχειοθετήσει.
 */
export type DeleteExerciseResult =
  | { deleted: true }
  | { deleted: false; reason: 'builtin' | 'in_use'; usage: Awaited<ReturnType<typeof countExerciseUsage>> };

export async function deleteExercise(id: string): Promise<DeleteExerciseResult> {
  const exercise = await db.exercises.get(id);
  if (!exercise || exercise.user_id === null) {
    return { deleted: false, reason: 'builtin', usage: await countExerciseUsage(id) };
  }
  const usage = await countExerciseUsage(id);
  if (usage.total > 0) {
    return { deleted: false, reason: 'in_use', usage };
  }
  const t = now();
  await db.exercises.update(id, { deleted_at: t, updated_at: t });
  return { deleted: true };
}

/** Όλες, μαζί με τις αρχειοθετημένες — για την οθόνη διαχείρισης. */
/** Μία άσκηση με βάση το id — για τη σελίδα λεπτομερειών/προόδου. */
export async function getExercise(id: string): Promise<Exercise | undefined> {
  const ex = await db.exercises.get(id);
  return ex && isVisibleToMe(ex) && ex.deleted_at == null ? ex : undefined;
}

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
  const count = (await db.skills.toArray()).filter((s) => s.deleted_at == null).length;
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

/**
 * Πόσα «κρέμονται» από ένα skill: σκαλιά, πρόοδος, ολοκληρώσεις βημάτων,
 * στόχοι. Ίδιο pattern με το `countExerciseUsage` — η διαγραφή μπλοκάρεται αν
 * υπάρχει ιστορικό, ώστε η πρόοδος του χρήστη να μη σβηστεί σιωπηλά.
 */
export async function countSkillUsage(id: string): Promise<{
  steps: number;
  progress: number;
  completions: number;
  goals: number;
  total: number;
}> {
  const steps = (await db.skill_steps.where('skill_id').equals(id).toArray()).filter(
    (s) => s.deleted_at == null,
  );
  const stepIds = new Set(steps.map((s) => s.id));
  // Tombstones δεν «κρέμονται» — μετράμε μόνο ζωντανές γραμμές.
  const [progressRows, completionsRows, goalsRows] = await Promise.all([
    db.user_skill_progress.where('skill_id').equals(id).toArray(),
    db.user_skill_step_completions.toArray(),
    // Το goals δεν έχει index στο skill_id (schema.ts: goals index δεν το
    // περιλαμβάνει) — φιλτράρουμε in-memory όπως τα completions.
    db.goals.toArray(),
  ]);
  const progress = progressRows.filter((p) => p.deleted_at == null).length;
  const completions = completionsRows.filter(
    (r) => r.deleted_at == null && stepIds.has(r.skill_step_id),
  ).length;
  const goals = goalsRows.filter((g) => g.skill_id === id && g.deleted_at == null).length;
  return {
    steps: steps.length,
    progress,
    completions,
    goals,
    total: steps.length + progress + completions + goals,
  };
}

export type DeleteSkillResult =
  | { deleted: true }
  | { deleted: false; reason: 'builtin' | 'in_use'; usage: Awaited<ReturnType<typeof countSkillUsage>> };

/**
 * Διαγραφή ΔΙΚΟΥ ΣΟΥ skill. Η διαγραφή γίνεται tombstone (`deleted_at`) ώστε
 * να ταξιδέψει με sync. Επιτρέπεται μόνο όταν δεν κρέμεται τίποτα από πάνω
 * (κανένα σκαλί/πρόοδος/ολοκλήρωση/στόχος), ώστε να μη μείνουν ορφανά.
 * Builtin (`user_id === null`) δεν διαγράφονται — μόνο αρχειοθετούνται.
 * Με ιστορικό → `{ deleted: false, reason: 'in_use' }`.
 */
export async function deleteSkill(id: string): Promise<DeleteSkillResult> {
  const skill = await db.skills.get(id);
  if (!skill || skill.user_id === null) {
    return { deleted: false, reason: 'builtin', usage: await countSkillUsage(id) };
  }
  const usage = await countSkillUsage(id);
  if (usage.total > 0) {
    return { deleted: false, reason: 'in_use', usage };
  }
  const t = now();
  await db.skills.update(id, { deleted_at: t, updated_at: t });
  return { deleted: true };
}

export interface SkillStepInput {
  added_weight_kg?: number | null;
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
  const existing = (
    await db.skill_steps.where('skill_id').equals(skillId).sortBy('step_number')
  ).filter((s) => s.deleted_at == null);
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
    added_weight_kg: input.added_weight_kg ?? null,
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
  if (!step || step.deleted_at != null) return;
  const t = now();
  // Soft delete βήματος + ολοκληρώσεών του: tombstones ταξιδεύουν με sync,
  // αλλιώς η διαγραφή ξαναγυρνούσε από άλλη συσκευή.
  await db.user_skill_step_completions
    .where('skill_step_id')
    .equals(id)
    .and((r) => r.deleted_at == null)
    .modify({ deleted_at: t, updated_at: t });
  await db.skill_steps.update(id, { deleted_at: t, updated_at: t });
  const rest = (
    await db.skill_steps.where('skill_id').equals(step.skill_id).sortBy('step_number')
  ).filter((s) => s.deleted_at == null);
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
    .filter(
      (a) => a.deleted_at == null && isVisibleToMe(a) && (includeArchived || !a.is_archived),
    )
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
    coach_enabled: false,
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
 * Η λίστα πινάκων ΔΕΝ γράφεται πια με το χέρι — παράγεται από το ΙΔΙΟ
 * `USER_DATA_TABLES` που τρέφει το export/import/sync, ώστε να μην ξεσυγχρονίζεται
 * (πριν έλειπαν `program_days`, `custom_trackers`, `custom_tracker_entries`:
 * σβήνοντας προφίλ έμεναν ορφανές μέρες προγράμματος και όλοι οι custom
 * trackers/entries — η λίστα cascade δεν ακολουθούσε το σχήμα). Οι 4 πίνακες
 * χωρίς δικό τους `user_id` (`sets`, `skill_steps`, `program_days`,
 * `program_exercises`) σβήνονται μέσω των γονικών ids — ίδιο μοτίβο ιδιοκτησίας
 * με `exportProfile`/`migrateProfileUserId`. Όλο το σβήσιμο τρέχει σε ΜΙΑ
 * transaction: ή φεύγουν όλα μαζί ή τίποτα — ένα crash στη μέση δεν πρέπει να
 * αφήνει το προφίλ μισοσβημένο.
 *
 * Tombstones: skills, skill_steps, user_skill_progress, user_skill_step_completions
 * και body_metrics ΔΕΝ διαγράφονται οριστικά — παίρνουν `deleted_at` ώστε το
 * deletion να συγχρονιστεί (server: `deleted` από `payload.deleted_at`). Τα
 * υπόλοιπα user-data tables μένουν hard delete (χωρίς tombstone column).
 */
export async function deleteProfile(id: string): Promise<void> {
  const tables = USER_DATA_TABLES();
  // Πίνακες χωρίς δικό τους `user_id` (ανήκουν μέσω γονέα) + ο `users` (PK=id).
  // Local (όχι top-level) ώστε να μη σπάσει το oxc parse-threshold του queries.ts.
  const CASCADE_NON_OWNER = new Set<string>([
    'users', 'sets', 'skill_steps', 'program_days', 'program_exercises',
  ]);
  await db.transaction(
    'rw',
    [...Object.values(tables), db.events_outgoing],
    async () => {
      // 1) Child tables (χωρίς user_id) — βρες τα ids των γονέων μου, σβήσε τα
      //    παιδιά ΠΡΙΝ φύγουν οι γονείς.
      const workoutIds = new Set(
        (await db.workouts.where('user_id').equals(id).toArray()).map((w) => w.id),
      );
      const allSets = await db.sets.toArray();
      await db.sets.bulkDelete(
        allSets.filter((s) => workoutIds.has(s.workout_id)).map((s) => s.id),
      );

      const programIds = new Set(
        (await db.programs.where('user_id').equals(id).toArray()).map((p) => p.id),
      );
      const allProgEx = await db.program_exercises.toArray();
      await db.program_exercises.bulkDelete(
        allProgEx.filter((r) => programIds.has(r.program_id)).map((r) => r.id),
      );
      // program_days: ΕΛΕΙΠΕ — έμεναν ορφανές μέρες προγράμματος (child των programs).
      const allProgDays = await db.program_days.toArray();
      await db.program_days.bulkDelete(
        allProgDays.filter((d) => programIds.has(d.program_id)).map((d) => d.id),
      );

      // Δικά του skills (τα seeded, user_id === null, μένουν κοινά) + τα
      // βήματά τους — αλλιώς ένα skill_step μένει πίσω δείχνοντας σε ένα
      // skill_id που δεν υπάρχει πια.
      const t = now();
      const skillIds = new Set(
        (await db.skills.where('user_id').equals(id).toArray()).map((s) => s.id),
      );
      if (skillIds.size > 0) {
        await db.skill_steps
          .where('skill_id')
          .anyOf([...skillIds])
          .modify({ deleted_at: t, updated_at: t });
      }

      // 2) Direct-owner tables (δικό τους `user_id`) — παράγονται από το
      //    USER_DATA_TABLES, άρα ένας νέος πίνακας εκεί σβήνεται αυτόματα εδώ
      //    (εκτός αν είναι child: τότε μπαίνει στο CASCADE_NON_OWNER + handler).
      //    Οι 4 πίνακες με `deleted_at` κάνουν tombstone, ώστε η διαγραφή να
      //    μη μπορεί να «αναστηθεί» από pull άλλης συσκευής.
      const TOMBSTONE_OWNER = new Set([
        'skills',
        'user_skill_progress',
        'user_skill_step_completions',
        'body_metrics',
        'scheduled_sessions',
      ]);
      for (const [name, table] of Object.entries(tables)) {
        if (CASCADE_NON_OWNER.has(name)) continue;
        if (TOMBSTONE_OWNER.has(name)) {
          await (table as unknown as Table<Record<string, unknown>, string>)
            .where('user_id')
            .equals(id)
            .modify({ deleted_at: t, updated_at: t });
          continue;
        }
        await (table as Table<{ user_id: string }, string>)
          .where('user_id')
          .equals(id)
          .delete();
      }

      // 3) events_outgoing (νεκρό sync stub, εκτός USER_DATA_TABLES) + ο ίδιος ο χρήστης.
      await db.events_outgoing.where('user_id').equals(id).delete();
      await db.users.delete(id);
    },
  );
}

/** Πόσα δεδομένα κρέμονται από ένα προφίλ — για να ξέρει ΤΙ σβήνει. */
export async function getProfileStats(id: string) {
  const [workouts, prs, programs, scheduled] = await Promise.all([
    db.workouts.where('user_id').equals(id).count(),
    db.personal_records
      .where('user_id')
      .equals(id)
      .filter((r) => r.deleted_at == null)
      .count(),
    db.programs.where('user_id').equals(id).count(),
    db.scheduled_sessions
      .where('user_id')
      .equals(id)
      .filter((s) => s.deleted_at == null)
      .count(),
  ]);
  return { workouts, prs, programs, scheduled };
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
  scheduled: number;
}> {
  const uid = getCurrentUserId();
  const ownedWorkouts = await db.workouts.where('user_id').equals(uid).toArray();
  // Τα soft-deleted δεν είναι «δεδομένα σου» — πριν, μια σβησμένη προπόνηση
  // (και τα σετ της) συνέχιζε να μετράει στο «Τα δεδομένα σου», σε αντίφαση
  // με το Ιστορικό/Ημερολόγιο που τη κρύβουν.
  const liveWorkoutIds = new Set(
    ownedWorkouts.filter((w) => w.deleted_at == null).map((w) => w.id),
  );
  const deletedWorkoutIds = new Set(
    ownedWorkouts.filter((w) => w.deleted_at != null).map((w) => w.id),
  );
  const [allSets, prs, stepsRows, scheduledRows] = await Promise.all([
    db.sets.toArray(),
    db.personal_records
      .where('user_id')
      .equals(uid)
      .filter((r) => r.deleted_at == null)
      .toArray(),
    db.user_skill_step_completions
      .where('user_id')
      .equals(uid)
      .filter((c) => c.deleted_at == null)
      .toArray(),
    db.scheduled_sessions
      .where('user_id')
      .equals(uid)
      .filter((s) => s.deleted_at == null)
      .toArray(),
  ]);
  const sets = allSets.filter(
    (s) => s.deleted_at == null && liveWorkoutIds.has(s.workout_id),
  ).length;
  const livePrs = prs.filter((r) => !deletedWorkoutIds.has(r.workout_id)).length;
  return {
    workouts: liveWorkoutIds.size,
    sets,
    prs: livePrs,
    steps: stepsRows.length,
    scheduled: scheduledRows.length,
  };
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
    db.scheduled_sessions,
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

  const live = sets
    .filter((s) => s.deleted_at == null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.set_number - b.set_number);
  const names = new Map(allExercises.map((e) => [e.id, e.name]));

  // Ομαδοποίηση με σειρά πρώτης εμφάνισης (created_at) — έτσι διαβάζεται όπως έγινε.
  const byExercise = new Map<string, SetEntry[]>();
  for (const s of live) {
    const list = byExercise.get(s.exercise_id);
    if (list) list.push(s);
    else byExercise.set(s.exercise_id, [s]);
  }
  for (const list of byExercise.values()) {
    list.sort((a, b) => a.set_number - b.set_number);
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
    totalSets: live.filter(isWorkingSet).length,
    prs: prs.filter((r) => r.workout_id === workoutId && r.deleted_at == null),
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
    .filter((p) => p.deleted_at == null && p.status === 'in_progress')
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
    .filter((r) => r.deleted_at == null)
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
    .filter((r) => r.deleted_at == null)
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
