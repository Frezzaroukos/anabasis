import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import {
  addProgramExercise,
  addSet,
  createExercise,
  createProgram,
  createProgramDay,
  startWorkout,
} from './queries';
import { addTrackerEntry, createTracker } from './trackers';
import { createScheduledSession } from './scheduledSessions';
import { checkDataIntegrity, repairDataIntegrity } from './integrity';

/**
 * Ο έλεγχος εντοπίζει orphans που δημιουργεί hard delete γονέα (παλιός
 * κώδικας/restore/sync) και η επιδιόρθωση τα κάνει αόρατα χωρίς να αγγίξει
 * υγιείς γραμμές.
 */
const UID = 'integrity-test';

beforeEach(async () => {
  setCurrentUserId(UID);
  for (const table of [
    db.workouts,
    db.sets,
    db.personal_records,
    db.exercises,
    db.programs,
    db.program_days,
    db.program_exercises,
    db.skills,
    db.skill_steps,
    db.custom_trackers,
    db.custom_tracker_entries,
    db.scheduled_sessions,
  ]) {
    await table.clear();
  }
});

describe('checkDataIntegrity', () => {
  it('βρίσκει σετ χωρίς προπόνηση και η επιδιόρθωση τα κάνει soft-deleted', async () => {
    const ex = await createExercise({ name: 'Squat' });
    const w = await startWorkout('strength');
    const set = await addSet({
      workout_id: w.id,
      exercise_id: ex.id,
      weight_kg: 60,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
    });
    await db.workouts.delete(w.id); // hard delete γονέα, το σετ μένει

    const report = await checkDataIntegrity();
    expect(report.ok).toBe(false);
    expect(report.issues.find((i) => i.code === 'setsWithoutWorkout')?.count).toBe(1);

    const res = await repairDataIntegrity();
    // Το addSet δημιουργεί και PRs για τη σβησμένη προπόνηση — γι' αυτό
    // ελέγχουμε το συγκεκριμένο code, όχι το συνολικό total.
    expect(res.repaired.setsWithoutWorkout).toBe(1);
    expect((await db.sets.get(set.id))?.deleted_at).toBeTruthy();
    expect((await checkDataIntegrity()).ok).toBe(true);
  });

  it('βρίσκει σετ σβησμένης προπόνησης', async () => {
    const ex = await createExercise({ name: 'Squat' });
    const w = await startWorkout('strength');
    const set = await addSet({
      workout_id: w.id,
      exercise_id: ex.id,
      weight_kg: 60,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
    });
    await db.workouts.update(w.id, { deleted_at: new Date().toISOString() });

    const report = await checkDataIntegrity();
    expect(report.issues.find((i) => i.code === 'setsOfDeletedWorkout')?.count).toBe(1);

    await repairDataIntegrity();
    expect((await db.sets.get(set.id))?.deleted_at).toBeTruthy();
  });

  it('βρίσκει personal record χωρίς προπόνηση και το κάνει tombstone', async () => {
    const t = new Date().toISOString();
    await db.personal_records.add({
      id: 'orphan-pr',
      user_id: UID,
      exercise_id: null,
      activity_kind: 'strength',
      type: 'weight',
      value: 100,
      reps: 1,
      weight_kg: 100,
      achieved_at: t,
      workout_id: 'missing-workout',
      set_id: null,
      created_at: t,
      updated_at: t,
    });

    const report = await checkDataIntegrity();
    expect(report.issues.find((i) => i.code === 'prsWithoutWorkout')?.count).toBe(1);

    await repairDataIntegrity();
    expect((await db.personal_records.get('orphan-pr'))?.deleted_at).toBeTruthy();
  });

  it('βρίσκει άσκηση προγράμματος που δείχνει σε σβησμένη μέρα', async () => {
    const ex = await createExercise({ name: 'Squat' });
    const program = await createProgram('P');
    const day = await createProgramDay(program.id, 'Day 1');
    const pe = await addProgramExercise(program.id, {
      exercise_id: ex.id,
      program_day_id: day.id,
    });
    await db.program_days.delete(day.id);

    const report = await checkDataIntegrity();
    expect(report.issues.find((i) => i.code === 'programExercisesWithoutDay')?.count).toBe(1);

    await repairDataIntegrity();
    expect((await db.program_exercises.get(pe.id))?.deleted_at).toBeTruthy();
  });

  it('planned session με σβησμένο πρόγραμμα: unlink program/day, όχι delete', async () => {
    const program = await createProgram('Broken Parent');
    const day = await createProgramDay(program.id, 'Day A');
    const session = await createScheduledSession({
      date: '2026-09-01',
      title: 'Planned with dead program',
      program_id: program.id,
      program_day_id: day.id,
    });
    await db.programs.update(program.id, { deleted_at: new Date().toISOString() });

    const report = await checkDataIntegrity();
    expect(report.issues.find((i) => i.code === 'scheduledWithoutProgram')?.count).toBe(1);
    expect(report.issues.find((i) => i.code === 'scheduledWithoutDay')?.count).toBe(1);

    await repairDataIntegrity();
    const row = await db.scheduled_sessions.get(session.id);
    expect(row).toBeTruthy();
    expect(row!.deleted_at).toBeNull();
    expect(row!.program_id).toBeNull();
    expect(row!.program_day_id).toBeNull();
    expect((await checkDataIntegrity()).ok).toBe(true);
  });

  it('planned session με σβησμένη μέρα προγράμματος: unlink μόνο το day', async () => {
    const program = await createProgram('Live Parent');
    const day = await createProgramDay(program.id, 'Day B');
    const session = await createScheduledSession({
      date: '2026-09-02',
      title: 'Planned with dead day',
      program_id: program.id,
      program_day_id: day.id,
    });
    await db.program_days.update(day.id, { deleted_at: new Date().toISOString() });

    const report = await checkDataIntegrity();
    expect(report.issues.find((i) => i.code === 'scheduledWithoutDay')?.count).toBe(1);

    await repairDataIntegrity();
    const row = await db.scheduled_sessions.get(session.id);
    expect(row!.deleted_at).toBeNull();
    expect(row!.program_id).toBe(program.id);
    expect(row!.program_day_id).toBeNull();
  });

  it('planned session με σβησμένη προπόνηση: unlink workout_id, κρατά το planned', async () => {
    const session = await createScheduledSession({
      date: '2026-09-03',
      title: 'Planned with dead workout',
    });
    const w = await startWorkout('strength');
    await db.scheduled_sessions.update(session.id, { workout_id: w.id });
    await db.workouts.update(w.id, { deleted_at: new Date().toISOString() });

    const report = await checkDataIntegrity();
    expect(report.issues.find((i) => i.code === 'scheduledWithoutWorkout')?.count).toBe(1);

    await repairDataIntegrity();
    const row = await db.scheduled_sessions.get(session.id);
    expect(row!.deleted_at).toBeNull();
    expect(row!.workout_id).toBeNull();
  });

  it('βρίσκει καταχώρηση tracker χωρίς tracker', async () => {
    const tracker = await createTracker('Pushups');
    await addTrackerEntry(tracker.id, 1);
    await db.custom_trackers.delete(tracker.id);

    const report = await checkDataIntegrity();
    expect(
      report.issues.find((i) => i.code === 'trackerEntriesWithoutTracker')?.count,
    ).toBe(1);

    await repairDataIntegrity();
    const entries = await db.custom_tracker_entries.toArray();
    expect(entries.every((e) => e.deleted_at != null)).toBe(true);
  });
});
