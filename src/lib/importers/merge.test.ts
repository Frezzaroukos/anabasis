import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/schema';
import { setCurrentUserId } from '@/lib/db/session';
import { addSet, startWorkout } from '@/lib/db/queries';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import { importWorkouts, previewExerciseMatch } from './merge';
import type { ImportedSet, ImportedWorkout } from './types';

/**
 * Το merge step είναι το σημείο όπου ξένα δεδομένα γίνονται δικά μας — τα
 * tests καλύπτουν τα τρία συμβόλαιά του: mapping ασκήσεων (case-insensitive
 * + auto-create), πιστή δημιουργία workout/sets, και duplicate detection
 * που κάνει το ξανα-import πλήρες no-op.
 */

const bench = SEED_EXERCISES.find((e) => e.name === 'Bench Press')!;

function set(partial: Partial<ImportedSet> & { setNumber: number }): ImportedSet {
  return {
    weightKg: null,
    reps: null,
    holdSeconds: null,
    rpe: null,
    isWarmup: false,
    isFailure: false,
    setType: 'normal',
    notes: null,
    suspect: false,
    suspectReason: null,
    raw: '',
    ...partial,
  };
}

function fixtureWorkout(): ImportedWorkout {
  return {
    key: 'strong-0',
    date: '2025-01-15',
    startedAtIso: new Date(2025, 0, 15, 17, 45).toISOString(),
    durationSeconds: 90 * 60,
    name: 'Push Day',
    notes: 'felt strong',
    exercises: [
      {
        // επίτηδες lowercase — πρέπει να βρει το seeded «Bench Press»
        name: 'bench press',
        sets: [
          set({ setNumber: 1, weightKg: 80, reps: 8, rpe: 8 }),
          set({ setNumber: 2, weightKg: 80, reps: 6, isFailure: true, setType: 'failure' }),
        ],
      },
      {
        name: 'Zercher Squat', // δεν υπάρχει στη βιβλιοθήκη
        sets: [set({ setNumber: 1, weightKg: 60, reps: 5 })],
      },
    ],
  };
}

beforeEach(async () => {
  setCurrentUserId('import-merge-test-profile');
  // καθαρή αφετηρία — το duplicate detection μετράει ΟΛΟ το ιστορικό
  await db.exercises.clear();
  await db.workouts.clear();
  await db.sets.clear();
  await db.personal_records.clear();
  await db.exercises.bulkPut(SEED_EXERCISES);
});

describe('importWorkouts', () => {
  it('χαρτογραφεί case-insensitively, δημιουργεί ό,τι λείπει, γράφει workout+sets', async () => {
    const res = await importWorkouts([fixtureWorkout()]);
    expect(res).toEqual({
      workoutsAdded: 1,
      setsAdded: 3,
      exercisesCreated: 1,
      duplicatesSkipped: 0,
    });

    const workouts = await db.workouts.toArray();
    expect(workouts).toHaveLength(1);
    const w = workouts[0]!;
    // η πραγματική ώρα του αρχείου, όχι η ώρα του import
    expect(w.started_at).toBe(new Date(2025, 0, 15, 17, 45).toISOString());
    expect(w.duration_seconds).toBe(90 * 60);
    expect(w.workout_type).toBe('Push Day');
    expect(w.notes).toBe('felt strong');
    expect(w.ended_at).toBe(new Date(2025, 0, 15, 19, 15).toISOString());

    const sets = await db.sets.toArray();
    expect(sets).toHaveLength(3);
    // τα «bench press» σετ δείχνουν στο ΥΠΑΡΧΟΝ seeded id — όχι σε διπλότυπο
    expect(sets.filter((s) => s.exercise_id === bench.id)).toHaveLength(2);
    expect(sets.find((s) => s.is_failure)?.set_type).toBe('failure');

    const zercher = (await db.exercises.toArray()).find((e) => e.name === 'Zercher Squat');
    expect(zercher).toBeTruthy();
    expect(zercher!.user_id).toBe('import-merge-test-profile');
  });

  it('ξανα-import του ίδιου αρχείου = πλήρες no-op', async () => {
    await importWorkouts([fixtureWorkout()]);
    const res = await importWorkouts([fixtureWorkout()]);
    expect(res.workoutsAdded).toBe(0);
    expect(res.setsAdded).toBe(0);
    expect(res.exercisesCreated).toBe(0);
    expect(res.duplicatesSkipped).toBe(3);
    expect(await db.workouts.count()).toBe(1);
    expect(await db.sets.count()).toBe(3);
  });

  it('σετ που υπάρχει ήδη από χειροκίνητη καταγραφή παραλείπεται, τα νέα μπαίνουν', async () => {
    // ο χρήστης είχε ήδη καταγράψει το 80×8 εκείνη τη μέρα με το χέρι
    const manual = await startWorkout('strength', '2025-01-15');
    await addSet({
      workout_id: manual.id,
      exercise_id: bench.id,
      weight_kg: 80,
      bodyweight_kg: null,
      reps: 8,
      hold_seconds: null,
    });

    const res = await importWorkouts([fixtureWorkout()]);
    expect(res.duplicatesSkipped).toBe(1); // το 80×8
    expect(res.setsAdded).toBe(2); // 80×6 + Zercher 60×5
  });

  it('πανομοιότυπα σετ μετριούνται ως πλήθος — 3 ίδια δεν γίνονται 1', async () => {
    const w = fixtureWorkout();
    w.exercises = [
      {
        name: 'Bench Press',
        sets: [
          set({ setNumber: 1, weightKg: 100, reps: 5 }),
          set({ setNumber: 2, weightKg: 100, reps: 5 }),
          set({ setNumber: 3, weightKg: 100, reps: 5 }),
        ],
      },
    ];
    const first = await importWorkouts([w]);
    expect(first.setsAdded).toBe(3);
    const again = await importWorkouts([w]);
    expect(again.setsAdded).toBe(0);
    expect(again.duplicatesSkipped).toBe(3);
  });

  it('τα δεδομένα άλλου προφίλ ΔΕΝ μετράνε ως duplicates', async () => {
    setCurrentUserId('other-profile');
    await importWorkouts([fixtureWorkout()]);

    setCurrentUserId('import-merge-test-profile');
    const res = await importWorkouts([fixtureWorkout()]);
    // ίδια σετ, άλλο προφίλ — πρέπει να μπουν κανονικά (και δική του άσκηση)
    expect(res.workoutsAdded).toBe(1);
    expect(res.setsAdded).toBe(3);
  });
});

describe('previewExerciseMatch', () => {
  it('ξεχωρίζει υπάρχουσες (case-insensitive) από αυτές που θα δημιουργηθούν', async () => {
    const { matched, missing } = await previewExerciseMatch([
      'bench press',
      'Bench Press', // διπλό ίδιο όνομα — μετράει μία φορά
      'Zercher Squat',
    ]);
    expect(matched).toEqual(['bench press']);
    expect(missing).toEqual(['Zercher Squat']);
  });
});
