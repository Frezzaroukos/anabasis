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
import type { Goal, GoalMetric, GoalPeriod, GoalPeriodAnchor } from './types';

const now = () => new Date().toISOString();

/** Πόσες μέρες πίσω κοιτά κάθε περίοδος όταν είναι κυλιόμενη. */
export const PERIOD_DAYS: Record<GoalPeriod, number> = {
  day: 1,
  week: 7,
  month: 30,
};

export interface GoalWindow {
  /** Αρχή του παραθύρου (00:00 τοπική ώρα). */
  start: Date;
  /**
   * Τέλος του παραθύρου. Για κυλιόμενα είναι «τώρα» — δεν υπάρχει προθεσμία,
   * το παράθυρο σέρνεται. Για ημερολογιακά είναι η στιγμή που κλείνει.
   */
  end: Date;
  /** Μέρες που απομένουν ως το κλείσιμο· null όταν δεν υπάρχει προθεσμία. */
  daysLeft: number | null;
}

/**
 * Το παράθυρο μέτρησης ενός στόχου.
 *
 * Καθαρή συνάρτηση με ενέσιμο «τώρα», ώστε να ελέγχεται σε συγκεκριμένες
 * ημερομηνίες — αλλιώς τα tests για «η εβδομάδα ξεκινά Δευτέρα» θα άλλαζαν
 * αποτέλεσμα ανάλογα με τη μέρα που τρέχουν.
 *
 * Η εβδομάδα ξεκινά **Δευτέρα** (ευρωπαϊκή σύμβαση, ίδια με το ημερολόγιο
 * της εφαρμογής· δεν αναμιγνύουμε δύο ορισμούς «εβδομάδας» στο ίδιο app).
 */
export function goalWindow(
  period: GoalPeriod,
  anchor: GoalPeriodAnchor,
  now: Date = new Date(),
): GoalWindow {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (anchor === 'rolling') {
    start.setDate(start.getDate() - (PERIOD_DAYS[period] - 1));
    return { start, end: now, daysLeft: null };
  }

  const end = new Date(start);
  if (period === 'week') {
    // getDay(): 0=Κυριακή → μετατροπή σε 0=Δευτέρα
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 7);
  } else if (period === 'month') {
    start.setDate(1);
    end.setTime(start.getTime());
    end.setMonth(end.getMonth() + 1);
  } else {
    end.setDate(end.getDate() + 1);
  }

  // Το `end` είναι το πρώτο 00:00 ΕΚΤΟΣ παραθύρου· οι μέρες που απομένουν
  // μετρώνται από τα μεσάνυχτα του σήμερα, όχι από την τρέχουσα ώρα.
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((end.getTime() - todayMidnight.getTime()) / 86_400_000);

  return { start, end, daysLeft };
}

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
    Partial<Pick<Goal, 'label' | 'activity_key' | 'exercise_id' | 'period_anchor'>>,
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
    // Ημερολογιακό by default: «αυτή την εβδομάδα» είναι ο τρόπος που
    // σκέφτεται ο περισσότερος κόσμος όταν λέει «4 φορές την εβδομάδα».
    period_anchor: input.period_anchor ?? 'calendar',
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
  /** Μέρες ως το κλείσιμο· null σε κυλιόμενο παράθυρο (δεν έχει προθεσμία). */
  daysLeft: number | null;
}

/**
 * Υπολογίζει την πρόοδο ενός στόχου.
 *
 * Διαβάζει ΜΟΝΟ ολοκληρωμένες προπονήσεις: μια προπόνηση σε εξέλιξη θα
 * ανέβαζε τον δείκτη και μετά θα τον κατέβαζε αν την ακύρωνες.
 */
export async function getGoalProgress(goal: Goal, now: Date = new Date()): Promise<GoalProgress> {
  const win = goalWindow(goal.period, goal.period_anchor, now);
  const startIso = win.start.toISOString();
  const endIso = win.end.toISOString();

  const workouts = (
    await db.workouts.where('user_id').equals(getCurrentUserId()).toArray()
  ).filter(
    (w) =>
      w.deleted_at == null &&
      w.ended_at != null &&
      w.started_at >= startIso &&
      w.started_at < endIso &&
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
    daysLeft: win.daysLeft,
  };
}

/** Πρόοδος για όλους τους ενεργούς στόχους, με τη σειρά που τους έβαλε ο χρήστης. */
export async function getAllGoalProgress(now: Date = new Date()): Promise<GoalProgress[]> {
  const goals = await listGoals();
  // ΟΧΙ `goals.map(getGoalProgress)`: το .map περνά και τον δείκτη, που θα
  // κατέληγε στην παράμετρο `now` ως αριθμός.
  return Promise.all(goals.map((g) => getGoalProgress(g, now)));
}
