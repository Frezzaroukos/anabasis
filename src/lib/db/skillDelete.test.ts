import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import {
  countSkillUsage,
  createSkill,
  addSkillStep,
  deleteSkill,
  getSkillWithSteps,
  listAllExercises,
  listSkills,
} from './queries';
import { createGoal } from './goals';
import { SEED_SKILLS } from './seeds';

/**
 * Διαγραφή skill: μόνο ΔΙΚΑ ΣΟΥ, άδεια (χωρίς σκαλιά/πρόοδο/ολοκληρώσεις/
 * στόχους). Builtin → blocked. Με ιστορικό → blocked με λόγο. Η διαγραφή
 * είναι tombstone (Wave 2) ώστε να ταξιδεύει με sync.
 */

beforeEach(async () => {
  setCurrentUserId('skill-delete-profile');
  await db.skills.clear();
  await db.skill_steps.clear();
  await db.user_skill_progress.clear();
  await db.user_skill_step_completions.clear();
  await db.goals.clear();
});

describe('deleteSkill', () => {
  it('διαγράφει δικό σου skill χωρίς σκαλιά/πρόοδο', async () => {
    const s = await createSkill({ name: 'Delete Me Skill' });
    const result = await deleteSkill(s.id);

    expect(result.deleted).toBe(true);
    expect((await db.skills.get(s.id))?.deleted_at).toBeTruthy();
    expect((await listSkills(true)).some((x) => x.id === s.id)).toBe(false);
  });

  it('μπλοκάρει skill με σκαλιά', async () => {
    const s = await createSkill({ name: 'Has Steps' });
    await addSkillStep(s.id, { name: 'Step 1', target_value: 10 });

    const result = await deleteSkill(s.id);
    expect(result.deleted).toBe(false);
    if (!result.deleted) {
      expect(result.reason).toBe('in_use');
      expect(result.usage.steps).toBe(1);
    }
    expect(await db.skills.get(s.id)).toBeTruthy();
  });

  it('μπλοκάρει skill με πρόοδο χρήστη', async () => {
    const s = await createSkill({ name: 'Has Progress' });
    const t = new Date().toISOString();
    await db.user_skill_progress.put({
      id: 'usp-1',
      user_id: 'skill-delete-profile',
      skill_id: s.id,
      current_step_id: null,
      status: 'in_progress',
      started_at: t,
      mastered_at: null,
      notes: null,
      created_at: t,
      updated_at: t,
    });

    const result = await deleteSkill(s.id);
    expect(result.deleted).toBe(false);
    if (!result.deleted) expect(result.usage.progress).toBe(1);
  });

  it('μπλοκάρει skill που είναι στόχος', async () => {
    const s = await createSkill({ name: 'Goal Skill' });
    const step = await addSkillStep(s.id, { name: 'S1', target_value: 5 });
    // Στόχος πάνω στο skill (και σκαλί, ώστε steps>0)· και τα δύο μετρούν.
    await createGoal({ metric: 'skill_steps', target: 1, period: 'week', skill_id: s.id });
    const result = await deleteSkill(s.id);
    expect(result.deleted).toBe(false);
    if (!result.deleted) expect(result.usage.goals).toBe(1);
    // καθάρισμα ώστε το σκαλί να μη διαρρεύσει σε επόμενο test
    expect(step.id).toBeTruthy();
  });

  it('μπλοκάρει builtin skill', async () => {
    const builtin = SEED_SKILLS[0]!;
    await db.skills.put(builtin);
    const result = await deleteSkill(builtin.id);
    expect(result.deleted).toBe(false);
    if (!result.deleted) expect(result.reason).toBe('builtin');
    expect(await db.skills.get(builtin.id)).toBeTruthy();
  });

  it('countSkillUsage αθροίζει σκαλιά + ολοκληρώσεις', async () => {
    const s = await createSkill({ name: 'Usage Skill' });
    const step = await addSkillStep(s.id, { name: 'S1', target_value: 10 });
    const t = new Date().toISOString();
    await db.user_skill_step_completions.put({
      id: 'c-1',
      user_id: 'skill-delete-profile',
      skill_step_id: step.id,
      achieved_value: 10,
      added_weight_kg: null,
      achieved_at: t,
      workout_id: null,
      notes: null,
      created_at: t,
    });

    const usage = await countSkillUsage(s.id);
    expect(usage.steps).toBe(1);
    expect(usage.completions).toBe(1);
    expect(usage.total).toBe(usage.steps + usage.progress + usage.completions + usage.goals);
  });

  it('getSkillWithSteps επιστρέφει null μετά τη διαγραφή ενός άδειου skill', async () => {
    const s = await createSkill({ name: 'Gone Skill' });
    await deleteSkill(s.id);
    expect(await getSkillWithSteps(s.id)).toBeNull();
    // sanity: το listAllExercises δεν σκάει / είναι ανεξάρτητο
    expect(Array.isArray(await listAllExercises())).toBe(true);
  });
});
