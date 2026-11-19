/**
 * Helper functions for fast workout & body data management.
 *
 * Kept separate from `queries.ts` (see CLAUDE.md §9 oxc/rolldown size limit)
 * while still routing all writes through `queries.ts` / Dexie with proper
 * `updated_at` stamping and soft-delete discipline.
 */

import { db } from './schema';
import { getCurrentUserId } from './session';
import {
  addSet,
  createExercise,
  endWorkout,
  getLatestBodyweight,
  localDay,
  saveBodyMetric,
  startWorkout,
  type ExerciseInput,
} from './queries';
import type { BodyMetric, Exercise, ExerciseCategory, PRType, SetEntry } from './types';
import type { QuickSet } from '@/features/workout/quickLog';

/**
 * Έξυπνες προεπιλογές για νέα άσκηση που δημιουργείται επί τόπου (create-on-miss):
 * μια calisthenics άσκηση όπως «Muscle Up» ή «Front Lever» παίρνει αμέσως
 * `is_bodyweight: true` ώστε να μη σε κλειδώνει σε υποχρεωτικά κιλά.
 */
export function inferExerciseDefaults(name: string): ExerciseInput {
  const n = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const isHold = /\b(hold|plank|l[\s-]?sit|v[\s-]?sit|handstand|lean|dead\s*hang|flag|maltese|victorian|iron\s*cross)\b/.test(n);
  const isBodyweight =
    isHold ||
    /\b(bw|bodyweight|muscle[\s-]?up|pull[\s-]?up|chin[\s-]?up|dip|push[\s-]?up|planche|lever|hspu|pistol|inverted\s*row|nordic|ab\s*wheel|dragon\s*flag|skin\s*the\s*cat|μονοζυγο|ελξεις|βυθισεις|καμψεις)\b/.test(n);

  let category: ExerciseCategory = 'other';
  if (/\b(bench|press|dip|push[\s-]?up|planche|tricep|chest|fly|hspu|handstand|shoulder|lateral|παγκος|βυθισεις|καμψεις|τρικεφαλ)\b/.test(n)) {
    category = 'push';
  } else if (/\b(pull|chin|row|muscle[\s-]?up|bicep|curl|lat|lever|deadlift|rdl|shrug|face\s*pull|rear\s*delt|μονοζυγο|ελξεις|κωπηλατικ|δικεφαλ)\b/.test(n)) {
    category = 'pull';
  } else if (/\b(squat|lunge|leg|calf|calves|nordic|pistol|hip|glute|hamstring|quad|καθισμα|ποδια|γαμπ)\b/.test(n)) {
    category = 'legs';
  } else if (/\b(abs|core|plank|l[\s-]?sit|v[\s-]?sit|hollow|oblique|dragon\s*flag|ab\s*wheel|hanging\s*leg|κοιλιακ)\b/.test(n)) {
    category = 'core';
  }

  return {
    name: name.trim(),
    category,
    movement_type: isHold ? 'skill' : 'compound',
    is_bodyweight: isBodyweight,
    is_weighted: !isHold,
    default_unit: isHold ? 'sec' : isBodyweight ? 'reps' : 'kg',
  };
}

/**
 * Καταγράφει ένα σύνολο QuickSets για μία άσκηση σε ένα workout, διατηρώντας
 * τις αλυσίδες drop-set (κοινό `group_id` ανά `dropGroup`), AMRAP/max και notes.
 */
export async function addQuickSets(opts: {
  workoutId: string;
  exercise: Exercise;
  parsed: QuickSet[];
  weighted: boolean;
  bodyweightKg: number | null;
  noteFallback?: string | null;
}): Promise<{ setsAdded: number; newPRs: PRType[] }> {
  const { workoutId, exercise, parsed, weighted, bodyweightKg, noteFallback = null } = opts;
  const isHold = exercise.default_unit === 'sec';
  const setBodyweight = exercise.is_bodyweight ? bodyweightKg : null;
  const groupIds = new Map<number, string>();
  const newPRs: PRType[] = [];

  for (const s of parsed) {
    let groupId: string | null = null;
    if (s.dropGroup != null) {
      let existing = groupIds.get(s.dropGroup);
      if (!existing) {
        existing = crypto.randomUUID();
        groupIds.set(s.dropGroup, existing);
      }
      groupId = existing;
    }

    const weightKg = s.weightKg != null ? s.weightKg : weighted ? null : null;
    const setType = s.setType ?? 'normal';
    const notes = s.notes ?? noteFallback;

    const res = await addSet({
      workout_id: workoutId,
      exercise_id: exercise.id,
      weight_kg: weightKg,
      bodyweight_kg: setBodyweight,
      reps: isHold ? null : s.reps,
      hold_seconds: isHold ? s.reps : null,
      set_type: setType,
      group_id: groupId,
      is_warmup: setType === 'warmup',
      is_failure: setType === 'failure',
      notes,
    });
    newPRs.push(...res.newPRs);
  }

  return { setsAdded: parsed.length, newPRs };
}

/** Αντιγράφει ένα υπάρχον σετ με ένα tap («+1 ίδιο σετ»). */
export async function duplicateSet(set: SetEntry) {
  return addSet({
    workout_id: set.workout_id,
    exercise_id: set.exercise_id,
    weight_kg: set.weight_kg,
    bodyweight_kg: set.bodyweight_kg,
    reps: set.reps,
    rest_pause_reps: set.rest_pause_reps ?? [],
    hold_seconds: set.hold_seconds,
    is_warmup: set.is_warmup,
    is_failure: set.is_failure,
    set_type: set.set_type,
    group_id: set.set_type === 'dropset' || set.set_type === 'superset' ? set.group_id : null,
    notes: set.notes,
    rpe: set.rpe,
    rir: set.rir,
    tempo: set.tempo,
  });
}

export interface SavePastedLineInput {
  /** Υπάρχουσα άσκηση από τη βιβλιοθήκη — αν null, δημιουργείται νέα με `newExerciseName`. */
  exerciseId: string | null;
  newExerciseName: string;
  sets: QuickSet[];
  noteHint?: string | null;
}

export interface SavePastedWorkoutResult {
  workoutId: string;
  setsAdded: number;
  exercisesCreated: number;
}

/**
 * Αποθηκεύει πολλαπλές γραμμές σημειώσεων προπόνησης είτε μέσα σε υπάρχουσα
 * προπόνηση (`workoutId`) είτε φτιάχνοντας νέα ολοκληρωμένη προπόνηση στη
 * δοσμένη ημερομηνία (`date`, YYYY-MM-DD).
 */
export async function savePastedWorkout(opts: {
  workoutId?: string;
  date?: string;
  workoutType?: string | null;
  lines: SavePastedLineInput[];
  /** Όταν δημιουργείται νέα προπόνηση: true = κλείνει αμέσως (ιστορικό), false = μένει ενεργή. */
  completeNewWorkout?: boolean;
}): Promise<SavePastedWorkoutResult> {
  const { workoutId: existingWorkoutId, date, workoutType, lines, completeNewWorkout = true } = opts;
  const activeLines = lines.filter((l) => l.sets.length > 0);
  if (activeLines.length === 0) {
    throw new Error('No sets to save');
  }

  let targetWorkoutId = existingWorkoutId;
  let targetDay = date ?? localDay();

  if (!targetWorkoutId) {
    const w = await startWorkout('strength', targetDay, null, null, workoutType?.trim() || null);
    targetWorkoutId = w.id;
  } else {
    const existing = await db.workouts.get(targetWorkoutId);
    if (existing) targetDay = localDay(new Date(existing.started_at));
  }

  const bodyweightKg = await getLatestBodyweight(targetDay);
  const allExercises = await db.exercises.toArray();
  const byId = new Map(allExercises.map((e) => [e.id, e]));
  const createdByNorm = new Map<string, Exercise>();

  let setsAdded = 0;
  let exercisesCreated = 0;

  for (const line of activeLines) {
    let ex: Exercise | undefined = line.exerciseId ? byId.get(line.exerciseId) : undefined;
    if (!ex) {
      const cleanName = line.newExerciseName.trim();
      const normKey = cleanName.toLowerCase();
      ex = createdByNorm.get(normKey);
      if (!ex) {
        ex = await createExercise(inferExerciseDefaults(cleanName));
        byId.set(ex.id, ex);
        createdByNorm.set(normKey, ex);
        exercisesCreated += 1;
      }
    }

    const res = await addQuickSets({
      workoutId: targetWorkoutId,
      exercise: ex,
      parsed: line.sets,
      weighted: line.sets.some((s) => s.weightKg != null),
      bodyweightKg,
      noteFallback: line.noteHint ?? null,
    });
    setsAdded += res.setsAdded;
  }

  if (!existingWorkoutId && completeNewWorkout) {
    // 0/undefined duration: για backdated ή quick-paste δεν εφευρίσκουμε ψεύτικη διάρκεια.
    const w = await db.workouts.get(targetWorkoutId);
    if (w) {
      const t = new Date().toISOString();
      await db.workouts.update(targetWorkoutId, {
        ended_at: w.started_at,
        duration_seconds: null,
        updated_at: t,
      });
    } else {
      await endWorkout(targetWorkoutId);
    }
  }

  return { workoutId: targetWorkoutId, setsAdded, exercisesCreated };
}

/** Πρόσφατες μετρήσεις σώματος (με τουλάχιστον ένα συμπληρωμένο πεδίο), νεότερες πρώτες. */
export async function listRecentBodyMetrics(limit = 14): Promise<BodyMetric[]> {
  const rows = await db.body_metrics
    .where('user_id')
    .equals(getCurrentUserId())
    .toArray();
  return rows
    .filter((m) => m.weight_kg != null || m.body_fat_pct != null || m.steps != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

/** Καθαρίζει τις τιμές μιας μέρας (sync-safe: ενημερώνει updated_at αντί για hard-delete). */
export async function clearBodyMetric(date: string): Promise<void> {
  await saveBodyMetric(date, {
    weight_kg: null,
    body_fat_pct: null,
    steps: null,
  });
}
