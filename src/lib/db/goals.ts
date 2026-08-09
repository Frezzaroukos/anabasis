/**
 * Στόχοι στα μέτρα του χρήστη.
 *
 * Γιατί ξεχωριστό module: το `queries.ts` έχει ήδη ~80 συναρτήσεις. Οι στόχοι
 * είναι αυτοτελής μηχανή (ορισμός → μέτρηση → πρόοδος) και διαβάζεται πιο
 * εύκολα μαζεμένη. Ο κανόνας «components ΠΟΤΕ db.* απευθείας» ισχύει κανονικά.
 *
 * Η κεντρική ιδέα: ΕΝΑΣ υπολογιστής προόδου που δέχεται τους τέσσερις άξονες
 * του στόχου (μέτρο × ποσό × περίοδος × εύρος). Χωρίς αυτό θα χρειαζόταν νέα
 * συνάρτηση για κάθε συνδυασμό — «εβδομαδιαίος όγκος», «μηνιαία χιλιόμετρα»,
 * «σετ έλξεων/εβδομάδα» — και θα σταματούσαμε στους 3-4 που φανταστήκαμε εμείς.
 */

import { v4 as uuid } from 'uuid';
import { db } from './schema';
import { getCurrentUserId } from './session';
import { setVolume } from '../domain/volume';
import type { Goal, GoalMetric, GoalPeriod } from './types';

const now = () => new Date().toISOString();

/** Πόσες μέρες πίσω κοιτά κάθε περίοδος (κυλιόμενο παράθυρο). */
export const PERIOD_DAYS: Record<GoalPeriod, number> = {
  day: 1,
  week: 7,
  month: 30,
};

/** Μονάδα εμφάνισης ανά μέτρο — ώστε το UI να μη «μαντεύει». */
export const METRIC_UNIT: Record<GoalMetric, string> = {
  sessions: '',
  volume_kg: 'kg',
  sets: '',
  reps: '',
  distance_km: 'km',
  duration_min: 'min',
};

/* ─────────────────────────── CRUD ─────────────────────────── */

export async function listGoals(includeArchived = false): Promise<Goal[]> {
  const rows = await db.goals.where('user_id').equals(getCurrentUserId()).toArray();
  return rows
    .filter((g) => g.deleted_at == null && (includeArchived || !g.is_archived))
    .sort((a, b) => a.display_order - b.display_order);
}

export async function createGoal(
  input: Pick<Goal, 'metric' | 'target' | 'period'> &
    Partial<Pick<Goal, 'label' | 'activity_key' | 'exercise_id'>>,
): Promise<Goal> {
  const t = now();
  const existing = await listGoals(true);
  const goal: Goal = {
    id: uuid(),
    user_id: getCurrentUserId(),
    label: input.label?.trim() || null,
    metric: input.metric,
    target: input.target,
    period: input.period,
    activity_key: input.activity_key ?? null,
    exercise_id: input.exercise_id ?? null,
    display_order: existing.length,
    is_archived: false,
    created_at: t,
    updated_at: t,
    deleted_at: null,
  };
  await db.goals.add(goal);
  return goal;
}

export async function updateGoal(
  id: string,
  patch: Partial<Omit<Goal, 'id' | 'user_id' | 'created_at'>>,
): Promise<void> {
  await db.goals.update(id, { ...patch, updated_at: now() });
}

/** Soft delete — ίδια σημασιολογία με τον υπόλοιπο κώδικα. */
export async function deleteGoal(id: string): Promise<void> {
  await db.goals.update(id, { deleted_at: now(), updated_at: now() });
}

export async function reorderGoals(idsInOrder: string[]): Promise<void> {
  const t = now();
  await db.transaction('rw', db.goals, async () => {
    await Promise.all(
      idsInOrder.map((id, i) => db.goals.update(id, { display_order: i, updated_at: t })),
    );
  });
}

/* ─────────────────────── Μέτρηση προόδου ─────────────────────── */

export interface GoalProgress {
  goal: Goal;
  current: number;
  target: number;
  /** 0..1 — κομμένο στο 1 για τον δακτύλιο· το `current` κρατά την αλήθεια. */
  ratio: number;
  unit: string;
  /** Πόσες μέρες μένουν στο παράθυρο (για «προλαβαίνω;»). */
  daysLeft: number;
}

/**
 * Υπολογίζει την πρόοδο ενός στόχου.
 *
 * Διαβάζει ΜΟΝΟ ολοκληρωμένες προπονήσεις: μια προπόνηση σε εξέλιξη θα
 * ανέβαζε τον δείκτη και μετά θα τον κατέβαζε αν την ακύρωνες.
 */
export async function getGoalProgress(goal: Goal): Promise<GoalProgress> {
  const days = PERIOD_DAYS[goal.period];
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  const workouts = (
    await db.workouts.where('user_id').equals(getCurrentUserId()).toArray()
  ).filter(
    (w) =>
      w.deleted_at == null &&
      w.ended_at != null &&
      w.started_at >= sinceIso &&
      (goal.activity_key == null || w.activity_kind === goal.activity_key),
  );

  let current = 0;

  if (goal.metric === 'sessions') {
    current = workouts.length;
  } else if (goal.metric === 'distance_km') {
    current = workouts.reduce((a, w) => a + (w.distance_km ?? 0), 0);
  } else if (goal.metric === 'duration_min') {
    current = workouts.reduce((a, w) => a + (w.duration_seconds ?? 0), 0) / 60;
  } else {
    // Μετρικές επιπέδου σετ — χρειάζονται τα σετ των προπονήσεων.
    const ids = new Set(workouts.map((w) => w.id));
    if (ids.size > 0) {
      const sets = (await db.sets.where('workout_id').anyOf([...ids]).toArray()).filter(
        (s) =>
          s.deleted_at == null &&
          // Τα warm-up δεν είναι δουλειά προς τον στόχο — ίδιος κανόνας με τα PR.
          // Ελέγχουμε και τα δύο πεδία: το `set_type` είναι το σύγχρονο, αλλά
          // το `is_warmup` μπορεί να στέκει μόνο του σε χειροκίνητα δεδομένα.
          s.set_type !== 'warmup' &&
          !s.is_warmup &&
          (goal.exercise_id == null || s.exercise_id === goal.exercise_id),
      );
      if (goal.metric === 'sets') current = sets.length;
      else if (goal.metric === 'reps') current = sets.reduce((a, s) => a + (s.reps ?? 0), 0);
      else if (goal.metric === 'volume_kg') current = sets.reduce((a, s) => a + setVolume(s), 0);
    }
  }

  current = Math.round(current * 10) / 10;

  return {
    goal,
    current,
    target: goal.target,
    ratio: goal.target > 0 ? Math.min(1, current / goal.target) : 0,
    unit: METRIC_UNIT[goal.metric],
    daysLeft: days - 1 - Math.floor((Date.now() - since.getTime()) / 86_400_000),
  };
}

/** Πρόοδος για όλους τους ενεργούς στόχους, με τη σειρά που τους έβαλε ο χρήστης. */
export async function getAllGoalProgress(): Promise<GoalProgress[]> {
  const goals = await listGoals();
  return Promise.all(goals.map(getGoalProgress));
}
