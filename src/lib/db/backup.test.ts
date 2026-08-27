import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import {
  addProgramExercise,
  createActivity,
  createExercise,
  createProgram,
  createSkill,
  exportAll,
  importAll,
  importBodyMetrics,
} from './queries';
import { createGoal } from './goals';

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
