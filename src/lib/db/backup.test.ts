import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import {
  addProgramExercise,
  addSet,
  addSkillStep,
  createActivity,
  createExercise,
  createProfile,
  createProgram,
  createProgramDay,
  createSkill,
  exportAll,
  exportProfile,
  importAll,
  importBodyMetrics,
  startWorkout,
} from './queries';
import { createGoal } from './goals';
import { getCurrentUserId } from './session';

/**
 * Το backup είναι η ΜΟΝΗ γραμμή άμυνας ενός no-backend app. Η v1 του format
 * εξήγαγε 8/16 πίνακες: μια «πλήρης» επαναφορά έχανε σιωπηλά goals, programs,
 * body metrics, activities και custom skills. Αυτό το αρχείο φυλάει το
 * round-trip: ό,τι γράφει ο χρήστης πρέπει να επιζεί export → wipe → import.
 */

const TABLES_WIPED = [
  'goals',
  'programs',
  'program_exercises',
  'body_metrics',
  'activities',
  'skills',
  'skill_steps',
  'exercises',
] as const;

beforeEach(async () => {
  setCurrentUserId('backup-test-profile');
  for (const name of TABLES_WIPED) await db.table(name).clear();
});

describe('backup round-trip', () => {
  it('restores every user-data table, not just the original 8', async () => {
    const ex = await createExercise({ name: 'Zercher Squat' });
    const program = await createProgram('Push A');
    await addProgramExercise(program.id, { exercise_id: ex.id });
    await createGoal({ metric: 'sessions', target: 4, period: 'week' });
    await importBodyMetrics([{ date: '2026-08-01', patch: { calories_in: 2500 } }]);
    await createActivity({ label: 'Παρκούρ' });
    await createSkill({ name: 'One-arm Hang' });

    const json = await exportAll();
    for (const name of TABLES_WIPED) await db.table(name).clear();
    expect(await db.goals.count()).toBe(0);

    const res = await importAll(json);
    expect(res.ok).toBe(true);

    expect(await db.goals.count()).toBe(1);
    expect(await db.programs.count()).toBe(1);
    expect(await db.program_exercises.count()).toBe(1);
    expect(await db.body_metrics.count()).toBe(1);
    expect((await db.activities.toArray()).some((a) => a.label === 'Παρκούρ')).toBe(true);
    expect((await db.skills.toArray()).some((s) => s.name === 'One-arm Hang')).toBe(true);
    expect((await db.exercises.toArray()).some((e) => e.name === 'Zercher Squat')).toBe(true);
  });

  it('rolls back atomically when a row in the file is unusable', async () => {
    await createGoal({ metric: 'sessions', target: 4, period: 'week' });
    const json = await exportAll();
    const parsed = JSON.parse(json);
    // Row χωρίς primary key: το bulkPut σκάει — ΤΙΠΟΤΑ δεν πρέπει να έχει γραφτεί.
    parsed.data.goals = [...parsed.data.goals, { not_an_id: true }];
    await db.goals.clear();

    const res = await importAll(JSON.stringify(parsed));
    expect(res.ok).toBe(false);
    expect(res.message).toBe('importFailed');
    expect(await db.goals.count()).toBe(0);
  });

  it('still accepts a v1 backup file (fewer tables)', async () => {
    const v1 = {
      format: 'anabasis-backup',
      version: 1,
      exported_at: '2026-08-01T00:00:00.000Z',
      data: {
        exercises: [
          {
            id: 'v1-ex',
            user_id: 'backup-test-profile',
            name: 'Old Backup Exercise',
            category: 'other',
            movement_type: 'compound',
            is_seeded: 0,
            created_at: '2026-08-01T00:00:00.000Z',
            updated_at: '2026-08-01T00:00:00.000Z',
          },
        ],
      },
    };
    const res = await importAll(JSON.stringify(v1));
    expect(res.ok).toBe(true);
    expect(await db.exercises.get('v1-ex')).toBeTruthy();
  });
});

/**
 * Codex audit §2: το `exportAll` έβγαζε ΟΛΑ τα προφίλ ενώ το UI έλεγε «your
 * data». Το `exportProfile` βγάζει ΜΟΝΟ το ενεργό προφίλ — μαζί με τα child rows
 * του (sets/skill_steps/program_days/program_exercises μέσω parent) και τίποτα
 * από άλλο προφίλ στην ίδια συσκευή.
 */
describe('exportProfile (current-profile scope)', () => {
  const SCOPED = [
    'users', 'exercises', 'workouts', 'sets', 'skills', 'skill_steps',
    'programs', 'program_days', 'program_exercises', 'goals',
  ] as const;

  async function seedProfile(name: string) {
    const profile = await createProfile(name);
    setCurrentUserId(profile.id);
    const ex = await createExercise({ name: `${name} Press` });
    const w = await startWorkout('strength');
    await addSet({ workout_id: w.id, exercise_id: ex.id, weight_kg: 40, bodyweight_kg: null, reps: 5, hold_seconds: null });
    const prog = await createProgram(`${name} Prog`);
    const day = await createProgramDay(prog.id, 'Day 1');
    await addProgramExercise(prog.id, { exercise_id: ex.id, program_day_id: day.id });
    const skill = await createSkill({ name: `${name} Lever` });
    await addSkillStep(skill.id, { name: 'tuck' });
    await createGoal({ metric: 'sessions', target: 3, period: 'week' });
    return profile.id;
  }

  beforeEach(async () => {
    for (const name of SCOPED) await db.table(name).clear();
    await db.custom_trackers.clear();
    await db.custom_tracker_entries.clear();
  });

  it('exports only the active profile and its child rows, never another profile', async () => {
    const idA = await seedProfile('Alpha');
    const idB = await seedProfile('Beta');

    setCurrentUserId(idA);
    const parsed = JSON.parse(await exportProfile());

    expect(parsed.scope).toBe('profile');
    expect(parsed.profile_id).toBe(idA);
    expect(getCurrentUserId()).toBe(idA);

    // Only profile A's own user row.
    expect(parsed.data.users.map((u: { id: string }) => u.id)).toEqual([idA]);
    // Direct-owner table scoped to A.
    expect(parsed.data.workouts.every((w: { user_id: string }) => w.user_id === idA)).toBe(true);
    expect(parsed.data.workouts.length).toBe(1);
    // Child tables (no own user_id) scoped via their parent: exactly A's rows.
    expect(parsed.data.sets.length).toBe(1);
    expect(parsed.data.program_days.length).toBe(1);
    expect(parsed.data.program_exercises.length).toBe(1);
    expect(parsed.data.skill_steps.length).toBe(1);

    // Beta must not appear ANYWHERE in the serialized backup.
    const blob = JSON.stringify(parsed.data);
    expect(blob).not.toContain(idB);
    expect(blob).not.toContain('Beta');
  });

  it('exportAll stays whole-device and tags scope=device', async () => {
    await seedProfile('Alpha');
    await seedProfile('Beta');
    const parsed = JSON.parse(await exportAll());
    expect(parsed.scope).toBe('device');
    // Both profiles present in the device-wide copy.
    expect(parsed.data.workouts.length).toBe(2);
  });
});
