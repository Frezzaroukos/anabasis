import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import {
  addSet,
  endWorkout,
  getWorkoutDetail,
  localDay,
  setWorkoutActivity,
  setWorkoutDate,
  setWorkoutDuration,
  softDeleteWorkout,
  startWorkout,
  updateSet,
} from './queries';
import { SEED_EXERCISES } from './seeds';

/**
 * Η διόρθωση μιας καταγραφής είναι ο κανόνας, όχι η εξαίρεση — πατάς λάθος
 * μέρα, λάθος άθλημα, ή απλά δεν έγινε. Τα tests εδώ φυλάνε το μέρος που
 * ΔΕΝ σκάει όταν χαλάσει: τα παράγωγα (σετ, ρεκόρ) που μένουν πίσω και
 * συνεχίζουν να λένε ψέματα.
 */
const squat = SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;

beforeEach(async () => {
  setCurrentUserId('workout-edit-profile');
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.workouts.clear();
  await db.sets.clear();
  await db.personal_records.clear();
});

async function loggedWorkout(kind = 'strength', onDate?: string) {
  const w = await startWorkout(kind, onDate);
  await addSet({
    workout_id: w.id,
    exercise_id: squat.id,
    weight_kg: 100,
    bodyweight_kg: null,
    reps: 5,
    hold_seconds: null,
  });
  await endWorkout(w.id);
  return w;
}

describe('softDeleteWorkout — τι παίρνει μαζί του', () => {
  it('σβήνει και τα σετ της προπόνησης', async () => {
    const w = await loggedWorkout();
    expect((await db.sets.where('workout_id').equals(w.id).toArray()).every((s) => s.deleted_at == null)).toBe(true);

    await softDeleteWorkout(w.id);

    const sets = await db.sets.where('workout_id').equals(w.id).toArray();
    expect(sets.length).toBeGreaterThan(0); // soft delete, όχι εξαφάνιση
    expect(sets.every((s) => s.deleted_at != null)).toBe(true);
  });

  it('σβήνει τα ρεκόρ που γέννησε — αλλιώς το app λέει ψέματα', async () => {
    const w = await loggedWorkout();
    expect((await db.personal_records.toArray()).length).toBeGreaterThan(0);

    await softDeleteWorkout(w.id);

    expect(await db.personal_records.toArray()).toHaveLength(0);
  });

  it('ΔΕΝ αγγίζει ρεκόρ άλλης προπόνησης', async () => {
    const keep = await loggedWorkout();
    const drop = await loggedWorkout();
    const before = (await db.personal_records.toArray()).filter((r) => r.workout_id === keep.id).length;
    expect(before).toBeGreaterThan(0);

    await softDeleteWorkout(drop.id);

    const after = await db.personal_records.toArray();
    expect(after.every((r) => r.workout_id === keep.id)).toBe(true);
    expect(after).toHaveLength(before);
  });

  it('η σβησμένη προπόνηση δεν ανοίγει πια', async () => {
    const w = await loggedWorkout();
    await softDeleteWorkout(w.id);
    expect(await getWorkoutDetail(w.id)).toBeNull();
  });
});

describe('μετακίνηση & αλλαγή αθλήματος', () => {
  it('αλλάζει μέρα κρατώντας την ώρα', async () => {
    const w = await loggedWorkout('strength', '2026-08-05');
    const beforeTime = new Date(w.started_at);

    await setWorkoutDate(w.id, '2026-08-03');

    const after = (await db.workouts.get(w.id))!;
    expect(localDay(new Date(after.started_at))).toBe('2026-08-03');
    expect(new Date(after.started_at).getHours()).toBe(beforeTime.getHours());
  });

  it('η μετακίνηση κρατά τη διάρκεια ίδια', async () => {
    const w = await loggedWorkout();
    const before = (await db.workouts.get(w.id))!;
    const span =
      before.ended_at != null
        ? new Date(before.ended_at).getTime() - new Date(before.started_at).getTime()
        : null;

    await setWorkoutDate(w.id, '2026-07-01');

    const after = (await db.workouts.get(w.id))!;
    if (span != null && after.ended_at != null) {
      expect(new Date(after.ended_at).getTime() - new Date(after.started_at).getTime()).toBe(span);
    }
  });

  it('αγνοεί άκυρη ημερομηνία αντί να σπάσει την εγγραφή', async () => {
    const w = await loggedWorkout();
    const before = (await db.workouts.get(w.id))!.started_at;

    await setWorkoutDate(w.id, 'όχι-ημερομηνία');

    expect((await db.workouts.get(w.id))!.started_at).toBe(before);
  });

  it('αλλάζει άθλημα και φαίνεται στη λεπτομέρεια', async () => {
    const w = await loggedWorkout('strength');
    await setWorkoutActivity(w.id, 'run');
    expect((await getWorkoutDetail(w.id))!.workout.activity_kind).toBe('run');
  });
});

describe('updateSet — διόρθωση ήδη καταγεγραμμένου σετ', () => {
  it('αποθηκεύει και ενημερώνει hold_seconds (isometric/skill holds)', async () => {
    const w = await startWorkout('skill');
    const set = await addSet({
      workout_id: w.id,
      exercise_id: squat.id,
      weight_kg: null,
      bodyweight_kg: null,
      reps: null,
      hold_seconds: 30,
    });
    expect(set.hold_seconds).toBe(30);

    await updateSet(set.id, { hold_seconds: 45 });
    const after = await db.sets.get(set.id);
    expect(after!.hold_seconds).toBe(45);
  });

  it('αλλάζει set_type και group_id (π.χ. μπαίνει σε dropset εκ των υστέρων)', async () => {
    const w = await startWorkout('strength');
    const set = await addSet({
      workout_id: w.id,
      exercise_id: squat.id,
      weight_kg: 100,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
    });
    expect(set.set_type).toBe('normal');
    expect(set.group_id).toBeNull();

    const groupId = 'dropset-group-1';
    await updateSet(set.id, { set_type: 'dropset', group_id: groupId });

    const after = await db.sets.get(set.id);
    expect(after!.set_type).toBe('dropset');
    expect(after!.group_id).toBe(groupId);
  });
});

describe('startWorkout — backdated στο ΤΟΠΙΚΟ μεσημέρι, όχι στο UTC', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('πέφτει στη σωστή τοπική μέρα ακόμα και πολύ μακριά από UTC (UTC+14)', async () => {
    vi.stubEnv('TZ', 'Pacific/Kiritimati'); // UTC+14 — το ακραίο άκρο ανατολικά
    const w = await startWorkout('strength', '2026-08-05');
    const started = new Date(w.started_at);
    // Με UTC μεσημέρι, 12:00 UTC + 14ω γίνεται 02:00 της ΕΠΟΜΕΝΗΣ τοπικής
    // μέρας — ακριβώς το bug. Με τοπικό μεσημέρι μένει στις 05/08, ώρα 12.
    expect(localDay(started)).toBe('2026-08-05');
    expect(started.getHours()).toBe(12);
  });
});

describe('setWorkoutDuration — χειροκίνητη/προαιρετική διάρκεια', () => {
  it('θέτει λεπτά→δευτερόλεπτα, καθαρίζει με null, αγνοεί μη-θετικά', async () => {
    const w = await loggedWorkout();
    await setWorkoutDuration(w.id, 45 * 60);
    expect((await getWorkoutDetail(w.id))!.workout.duration_seconds).toBe(2700);

    await setWorkoutDuration(w.id, null);
    expect((await getWorkoutDetail(w.id))!.workout.duration_seconds).toBeNull();

    await setWorkoutDuration(w.id, 0);
    expect((await getWorkoutDetail(w.id))!.workout.duration_seconds).toBeNull();
  });

  it('δίνει διάρκεια σε backdated προπόνηση που δεν είχε (endWorkout την άφησε null)', async () => {
    const w = await loggedWorkout('strength', '2026-06-01');
    // backdated → endWorkout βάζει null
    expect((await getWorkoutDetail(w.id))!.workout.duration_seconds).toBeNull();
    await setWorkoutDuration(w.id, 30 * 60);
    expect((await getWorkoutDetail(w.id))!.workout.duration_seconds).toBe(1800);
  });
});
