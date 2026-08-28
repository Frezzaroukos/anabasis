/**
 * Merge step: από το κοινό ενδιάμεσο σχήμα (ImportedWorkout) σε πραγματικές
 * εγγραφές workouts/sets μέσω του query layer.
 *
 * Αρχές:
 *  - mapping ασκήσεων case-insensitively στην υπάρχουσα βιβλιοθήκη· ό,τι
 *    λείπει δημιουργείται ως δική σου (custom) άσκηση — τίποτα δεν πετιέται,
 *  - duplicate detection με υπογραφή (μέρα+άσκηση+σειρά+βάρος+reps+seconds):
 *    ξανα-import του ίδιου αρχείου = no-op, όχι διπλά δεδομένα,
 *  - χρονολογική σειρά import ώστε τα PRs που παράγει το addSet να χτίζονται
 *    με τη σειρά που έγιναν στην πραγματικότητα.
 */

import { db } from '@/lib/db/schema';
import { getCurrentUserId } from '@/lib/db/session';
import {
  addSet,
  createExercise,
  listAllExercises,
  localDay,
  startWorkout,
  updateWorkoutMeta,
} from '@/lib/db/queries';
import type { Exercise } from '@/lib/db/types';
import type { ImportedSet, ImportedWorkout } from './types';

export interface WorkoutImportResult {
  workoutsAdded: number;
  setsAdded: number;
  exercisesCreated: number;
  duplicatesSkipped: number;
}

const normName = (s: string) => s.trim().toLowerCase();

/**
 * Υπογραφή σετ για duplicate detection: μέρα+άσκηση+βάρος+reps+seconds.
 * ΧΩΡΙΣ set_number — το addSet ξανα-αριθμεί ανά workout, οπότε ο αριθμός
 * δεν είναι σταθερός μεταξύ imports. Τα πανομοιότυπα σετ (100kg×5 ×3)
 * μετριούνται ως πλήθος (multiset): 3 υπάρχοντα καλύπτουν 3 του αρχείου.
 */
function setSignature(
  day: string,
  exerciseId: string,
  weightKg: number | null,
  reps: number | null,
  holdSeconds: number | null,
): string {
  return `${day}|${exerciseId}|${weightKg ?? ''}|${reps ?? ''}|${holdSeconds ?? ''}`;
}

/** Πλήθος υπαρχόντων σετ ανά υπογραφή, για όλο το προφίλ. */
async function existingSignatures(): Promise<Map<string, number>> {
  const uid = getCurrentUserId();
  const workouts = await db.workouts
    .where('user_id')
    .equals(uid)
    .filter((w) => w.deleted_at == null)
    .toArray();
  const dayByWorkout = new Map(workouts.map((w) => [w.id, localDay(new Date(w.started_at))]));
  const sigs = new Map<string, number>();
  if (dayByWorkout.size === 0) return sigs;
  const sets = await db.sets
    .where('workout_id')
    .anyOf([...dayByWorkout.keys()])
    .filter((s) => s.deleted_at == null)
    .toArray();
  for (const s of sets) {
    const day = dayByWorkout.get(s.workout_id)!;
    const sig = setSignature(day, s.exercise_id, s.weight_kg, s.reps, s.hold_seconds);
    sigs.set(sig, (sigs.get(sig) ?? 0) + 1);
  }
  return sigs;
}

/**
 * Preview για το UI: ποια ονόματα ασκήσεων του αρχείου υπάρχουν ήδη και ποια
 * θα δημιουργηθούν — ο χρήστης το βλέπει ΠΡΙΝ πατήσει import.
 */
export async function previewExerciseMatch(
  names: string[],
): Promise<{ matched: string[]; missing: string[] }> {
  const existing = new Set((await listAllExercises()).map((e) => normName(e.name)));
  const matched: string[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const key = normName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    (existing.has(key) ? matched : missing).push(name);
  }
  return { matched, missing };
}

async function resolveExercise(
  name: string,
  byName: Map<string, Exercise>,
  counters: WorkoutImportResult,
): Promise<Exercise> {
  const key = normName(name);
  const found = byName.get(key);
  if (found) return found;
  // Δεν μαντεύουμε category/equipment από το όνομα — ο χρήστης μπορεί να τα
  // συμπληρώσει μετά· το import δεν πρέπει να «βαφτίζει» λάθος δεδομένα.
  const created = await createExercise({ name: name.trim() });
  byName.set(key, created);
  counters.exercisesCreated += 1;
  return created;
}

async function importOneSet(
  workoutId: string,
  exerciseId: string,
  s: ImportedSet,
): Promise<void> {
  await addSet({
    workout_id: workoutId,
    exercise_id: exerciseId,
    weight_kg: s.weightKg,
    bodyweight_kg: null,
    reps: s.reps,
    hold_seconds: s.holdSeconds,
    rpe: s.rpe,
    is_warmup: s.isWarmup,
    is_failure: s.isFailure,
    set_type: s.setType,
    notes: s.notes,
  });
}

/**
 * Κάνει import τα επιλεγμένα workouts. Τα σετ που υπάρχουν ήδη (ίδια
 * υπογραφή) παραλείπονται· workout που μένει χωρίς κανένα νέο σετ δεν
 * δημιουργείται καθόλου — έτσι το ξανα-import είναι πλήρες no-op.
 */
export async function importWorkouts(
  workouts: ImportedWorkout[],
): Promise<WorkoutImportResult> {
  const result: WorkoutImportResult = {
    workoutsAdded: 0,
    setsAdded: 0,
    exercisesCreated: 0,
    duplicatesSkipped: 0,
  };

  const byName = new Map<string, Exercise>();
  for (const e of await listAllExercises()) {
    const key = normName(e.name);
    if (!byName.has(key)) byName.set(key, e);
  }
  const sigs = await existingSignatures();

  // χρονολογικά — τα PRs χτίζονται με τη σειρά που έγιναν
  const ordered = [...workouts].sort((a, b) => a.startedAtIso.localeCompare(b.startedAtIso));

  for (const w of ordered) {
    // Πρώτο πέρασμα ΧΩΡΙΣ writes: ποια σετ είναι όντως νέα. Αν κανένα, το
    // workout δεν πρέπει καν να δημιουργηθεί.
    const plan: Array<{ exercise: Exercise; sets: ImportedSet[] }> = [];
    for (const ex of w.exercises) {
      const exercise = await resolveExercise(ex.name, byName, result);
      const fresh: ImportedSet[] = [];
      for (const s of ex.sets) {
        const sig = setSignature(w.date, exercise.id, s.weightKg, s.reps, s.holdSeconds);
        const available = sigs.get(sig) ?? 0;
        if (available > 0) {
          // υπάρχει ήδη ένα ίδιο σετ εκείνη τη μέρα — «καταναλώνεται» ώστε
          // ένα ΤΕΤΑΡΤΟ πανομοιότυπο σετ του αρχείου να περάσει κανονικά
          sigs.set(sig, available - 1);
          result.duplicatesSkipped += 1;
          continue;
        }
        fresh.push(s);
      }
      if (fresh.length > 0) plan.push({ exercise, sets: fresh });
    }
    if (plan.length === 0) continue;

    const workout = await startWorkout('strength', w.date);
    for (const { exercise, sets } of plan) {
      for (const s of sets) {
        await importOneSet(workout.id, exercise.id, s);
        result.setsAdded += 1;
      }
    }
    if (w.name || w.notes) {
      await updateWorkoutMeta(workout.id, {
        workout_type: w.name ?? null,
        notes: w.notes ?? null,
      });
    }
    // Το endWorkout μετράει wall-clock διάρκεια — άχρηστο για ιστορικό
    // import όπου η πραγματική ώρα/διάρκεια είναι ΗΔΗ γνωστές από το αρχείο.
    // Γράφουμε τα τελικά χρονικά πεδία απευθείας (το query layer δεν έχει
    // «κλείσε backdated με γνωστή διάρκεια» API).
    const startedMs = Date.parse(w.startedAtIso);
    const endedIso =
      w.durationSeconds != null
        ? new Date(startedMs + w.durationSeconds * 1000).toISOString()
        : w.startedAtIso;
    await db.workouts.update(workout.id, {
      started_at: w.startedAtIso,
      ended_at: endedIso,
      duration_seconds: w.durationSeconds,
      updated_at: new Date().toISOString(),
    });
    result.workoutsAdded += 1;
  }

  return result;
}
