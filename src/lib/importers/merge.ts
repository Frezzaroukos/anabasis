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
  isWarmup: boolean,
  setType: string | null | undefined,
): string {
  // Warm-up και working set είναι ΔΙΑΦΟΡΕΤΙΚΑ σετ ακόμη κι αν έχουν ίδιο
  // βάρος/reps. Χωρίς το kind, ένα warm-up 100×5 «έτρωγε» το υπάρχον working
  // 100×5 και το working περνούσε ως δεύτερο working (audit #15).
  // Τα υπόλοιπα set types (dropset/failure/…) μένουν διακριτά· το warm-up
  // κανονικοποιείται ώστε legacy is_warmup/set_type αποκλίσεις να μη
  // δημιουργούν διπλό.
  const kind = isWarmup || setType === 'warmup' ? 'warmup' : (setType || 'normal');
  return `${day}|${exerciseId}|${weightKg ?? ''}|${reps ?? ''}|${holdSeconds ?? ''}|${kind}`;
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
    const sig = setSignature(
      day,
      s.exercise_id,
      s.weight_kg,
      s.reps,
      s.hold_seconds,
      s.is_warmup,
      s.set_type,
    );
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

interface PlannedExercise {
  name: string;
  /** Υπάρχουσα άσκηση ή undefined = θα δημιουργηθεί ΜΟΝΟ αν το workout γραφτεί. */
  existing: Exercise | undefined;
  sets: ImportedSet[];
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
  const byName = new Map<string, Exercise>();
  for (const e of await listAllExercises()) {
    const key = normName(e.name);
    if (!byName.has(key)) byName.set(key, e);
  }
  const sigs = await existingSignatures();

  // χρονολογικά — τα PRs χτίζονται με τη σειρά που έγιναν
  const ordered = [...workouts].sort((a, b) => a.startedAtIso.localeCompare(b.startedAtIso));

  /*
   * Φάση 1 — ΜΟΝΟ ΑΝΑΓΝΩΣΗ. Αποφασίζουμε ποια σετ είναι όντως νέα ΠΡΙΝ
   * γράψουμε οτιδήποτε. Έτσι ένα import που τελικά δεν εισάγει τίποτα δεν
   * αφήνει πίσω orphan custom ασκήσεις.
   */
  const plans: Array<{ workout: ImportedWorkout; exercises: PlannedExercise[] }> = [];
  let duplicatesSkipped = 0;

  for (const w of ordered) {
    const exercises: PlannedExercise[] = [];
    for (const ex of w.exercises) {
      const key = normName(ex.name);
      const existing = byName.get(key);
      // Αν η άσκηση δεν υπάρχει, κανένα υπάρχον σετ δεν μπορεί να ταιριάξει.
      const signatureExerciseId = existing?.id ?? `new:${key}`;
      const fresh: ImportedSet[] = [];
      for (const s of ex.sets) {
        const sig = setSignature(
          w.date,
          signatureExerciseId,
          s.weightKg,
          s.reps,
          s.holdSeconds,
          s.isWarmup,
          s.setType,
        );
        const available = sigs.get(sig) ?? 0;
        if (available > 0) {
          // υπάρχει ήδη ένα ίδιο σετ εκείνη τη μέρα — «καταναλώνεται» ώστε
          // ένα ΤΕΤΑΡΤΟ πανομοιότυπο σετ του αρχείου να περάσει κανονικά
          sigs.set(sig, available - 1);
          duplicatesSkipped += 1;
          continue;
        }
        fresh.push(s);
      }
      if (fresh.length > 0) {
        exercises.push({ name: ex.name.trim(), existing, sets: fresh });
      }
    }
    if (exercises.length > 0) plans.push({ workout: w, exercises });
  }

  if (plans.length === 0) {
    return { workoutsAdded: 0, setsAdded: 0, exercisesCreated: 0, duplicatesSkipped };
  }

  // Μοναδικά ονόματα που χρειάζονται νέα άσκηση — μόνο για workouts που θα
  // γραφτούν όντως.
  const missing = new Map<string, string>();
  for (const p of plans) {
    for (const pe of p.exercises) {
      if (pe.existing) continue;
      const key = normName(pe.name);
      if (!missing.has(key)) missing.set(key, pe.name);
    }
  }

  let workoutsAdded = 0;
  let setsAdded = 0;
  let exercisesCreated = 0;

  /*
   * Φάση 2 — ΟΛΑ τα writes σε ΜΙΑ transaction: ή μπαίνει ολόκληρο το import ή
   * τίποτα (ούτε μισό workout, ούτε άσκηση χωρίς σετ).
   */
  await db.transaction(
    'rw',
    [db.exercises, db.workouts, db.sets, db.personal_records, db.body_metrics],
    async () => {
      for (const [key, name] of missing) {
        const created = await createExercise({ name });
        byName.set(key, created);
        exercisesCreated += 1;
      }

      for (const { workout: w, exercises } of plans) {
        const workout = await startWorkout('strength', w.date);
        for (const pe of exercises) {
          const exercise = pe.existing ?? byName.get(normName(pe.name));
          if (!exercise) throw new Error(`exercise not resolved: ${pe.name}`);
          for (const s of pe.sets) {
            await importOneSet(workout.id, exercise.id, s);
            setsAdded += 1;
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
        workoutsAdded += 1;
      }
    },
  );

  return { workoutsAdded, setsAdded, exercisesCreated, duplicatesSkipped };
}
