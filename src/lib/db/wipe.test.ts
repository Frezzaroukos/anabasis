import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import {
  addProgramExercise,
  addSet,
  addSkillStep,
  createActivity,
  createExercise,
  createProgram,
  createProgramDay,
  createSkill,
  getCurrentProfileDataCounts,
  importBodyMetrics,
  listActivities,
  startWorkout,
} from './queries';
import { createGoal } from './goals';
import { addTrackerEntry, createTracker } from './trackers';
import { deleteCurrentProfileData } from './wipe';
import type { Activity } from './types';

/**
 * «Διαγραφή όλων των δεδομένων» για ΕΝΑ προφίλ: φεύγει ό,τι κατέγραψε ο
 * χρήστης, μένουν τα builtin rows, το προφίλ και τα δεδομένα των άλλων
 * προφίλ της ίδιας συσκευής.
 */
const A = 'wipe-test-a';
const B = 'wipe-test-b';

beforeEach(async () => {
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
    db.user_skill_progress,
    db.user_skill_step_completions,
    db.activities,
    db.goals,
    db.body_metrics,
    db.custom_trackers,
    db.custom_tracker_entries,
  ]) {
    await table.clear();
  }
});

async function seedProfile(uid: string, label: string): Promise<void> {
  setCurrentUserId(uid);
  const ex = await createExercise({ name: `${label} Squat` });
  const w = await startWorkout('strength', '2026-08-15');
  await addSet({
    workout_id: w.id,
    exercise_id: ex.id,
    weight_kg: 80,
    bodyweight_kg: null,
    reps: 5,
    hold_seconds: null,
  });
  const program = await createProgram(`${label} Program`);
  const day = await createProgramDay(program.id, 'Day 1');
  await addProgramExercise(program.id, { exercise_id: ex.id, program_day_id: day.id });
  const skill = await createSkill({ name: `${label} Skill` });
  await addSkillStep(skill.id, { name: 'Step 1', target_value: 10 });
  await createActivity({ label: `${label} Sport` });
  await createGoal({ metric: 'sessions', target: 3, period: 'week' });
  await importBodyMetrics([{ date: '2026-08-15', patch: { calories_in: 2200 } }]);
  const tracker = await createTracker(`${label} Tracker`);
  await addTrackerEntry(tracker.id, 1);
}

async function addBuiltinActivity(): Promise<Activity> {
  const t = new Date().toISOString();
  const a: Activity = {
    id: 'wipe-builtin-activity',
    user_id: null,
    key: 'strength',
    label: 'Strength',
    icon: '▲',
    dot_class: 'bg-zinc-400',
    uses_sets: true,
    tracks_distance: false,
    is_builtin: true,
    is_archived: false,
    display_order: 0,
    created_at: t,
    updated_at: t,
  };
  await db.activities.add(a);
  return a;
}

describe('deleteCurrentProfileData', () => {
  it('σβήνει όλα τα δεδομένα του ενεργού προφίλ και αφήνει builtin + άλλα προφίλ', async () => {
    await addBuiltinActivity();
    await seedProfile(A, 'Alpha');
    await seedProfile(B, 'Beta');

    setCurrentUserId(A);
    expect(await getCurrentProfileDataCounts()).toMatchObject({ workouts: 1, sets: 1 });

    const res = await deleteCurrentProfileData();
    expect(res.counts.workouts).toBe(1);
    expect(res.counts.sets).toBe(1);
    expect(res.counts.body_metrics).toBe(1);

    expect(await getCurrentProfileDataCounts()).toEqual({
      workouts: 0,
      sets: 0,
      prs: 0,
      steps: 0,
    });
    // Τα δικά του custom activities έφυγαν· το builtin μένει.
    expect((await listActivities()).map((a) => a.label)).not.toContain('Alpha Sport');

    // Builtin row επιβιώνει.
    expect((await db.activities.get('wipe-builtin-activity'))?.deleted_at).toBeFalsy();

    // Το άλλο προφίλ παραμένει ανέγγιχτο.
    setCurrentUserId(B);
    expect(await getCurrentProfileDataCounts()).toMatchObject({ workouts: 1, sets: 1 });
    expect((await listActivities()).map((a) => a.label)).toContain('Beta Sport');
  });

  it('είναι idempotent — δεύτερη κλήση δεν σβήνει τίποτα επιπλέον', async () => {
    await seedProfile(A, 'Alpha');
    setCurrentUserId(A);

    await deleteCurrentProfileData();
    const second = await deleteCurrentProfileData();
    expect(second.counts).toEqual({});
    expect(await getCurrentProfileDataCounts()).toMatchObject({ workouts: 0, sets: 0 });
  });
});
