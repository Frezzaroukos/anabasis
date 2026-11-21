import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import {
  achieveStep,
  addSkillStep,
  createSkill,
  deleteProfile,
  getAllSkillProgress,
  getBodyMetric,
  getCurrentProfileDataCounts,
  getLatestBodyweight,
  getSkillProgress,
  getSkillStepStats,
  getSkillWithSteps,
  getStepCompletions,
  getBodyTrend,
  listSkills,
  removeSkillStep,
  saveBodyMetric,
  undoStep,
} from './queries';
import { createScheduledSession } from './scheduledSessions';

/**
 * Wave 2 — tombstones. Κάθε διαγραφή σε skills/steps/progress/completions/
 * body_metrics πρέπει να αφήνει `deleted_at` (για να ταξιδέψει με sync) και
 * ΚΑΘΕ reader να φιλτράρει τα σβησμένα. Εδώ κλειδώνονται και τα unique-index
 * revival paths (progress/body έχουν &[user_id+...]).
 */
const UID = 'tombstone-test';

beforeEach(async () => {
  setCurrentUserId(UID);
  for (const table of [
    db.users,
    db.skills,
    db.skill_steps,
    db.user_skill_progress,
    db.user_skill_step_completions,
    db.body_metrics,
    db.scheduled_sessions,
  ]) {
    await table.clear();
  }
});

describe('undoStep', () => {
  it('αφήνει tombstone ολοκλήρωσης και ο reader δεν το επιστρέφει', async () => {
    const skill = await createSkill({ name: 'Front Lever' });
    const step = await addSkillStep(skill.id, { name: 'Tuck', target_value: 10 });
    await achieveStep(skill.id, step.id, 10);
    expect((await getStepCompletions([step.id])).size).toBe(1);

    await undoStep(skill.id, step.id);

    const rows = await db.user_skill_step_completions
      .where('user_id')
      .equals(UID)
      .toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deleted_at).toBeTruthy();
    expect(await getStepCompletions([step.id])).toEqual(new Map());
    expect((await getSkillStepStats()).get(skill.id)).toEqual({ total: 1, done: 0 });
    expect((await getSkillProgress(skill.id))?.status).toBe('in_progress');
  });

  it('ξανα-κατάκτηση μετά από undo γράφει ΝΕΑ ζωντανή ολοκλήρωση', async () => {
    const skill = await createSkill({ name: 'Back Lever' });
    const step = await addSkillStep(skill.id, { name: 'Tuck', target_value: 10 });
    await achieveStep(skill.id, step.id, 10);
    await undoStep(skill.id, step.id);
    await achieveStep(skill.id, step.id, 12);

    const rows = await db.user_skill_step_completions
      .where('user_id')
      .equals(UID)
      .toArray();
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.deleted_at == null)).toHaveLength(1);
    expect((await getStepCompletions([step.id])).get(step.id)?.achieved_value).toBe(12);
  });
});

describe('removeSkillStep', () => {
  it('κάνει tombstone βήματος + ολοκληρώσεων και ξανα-αριθμεί μόνο τα ζωντανά', async () => {
    const skill = await createSkill({ name: 'Planche' });
    const s1 = await addSkillStep(skill.id, { name: 'Lean' });
    const s2 = await addSkillStep(skill.id, { name: 'Tuck' });
    const s3 = await addSkillStep(skill.id, { name: 'Straddle' });
    await achieveStep(skill.id, s2.id, s2.target_value);

    await removeSkillStep(s2.id);

    const step = await db.skill_steps.get(s2.id);
    expect(step?.deleted_at).toBeTruthy();
    const completionRows = await db.user_skill_step_completions
      .where('user_id')
      .equals(UID)
      .toArray();
    expect(completionRows).toHaveLength(1);
    expect(completionRows[0]!.deleted_at).toBeTruthy();

    const bundle = (await getSkillWithSteps(skill.id))!;
    expect(bundle.steps.map((s) => s.id)).toEqual([s1.id, s3.id]);
    expect(bundle.steps.map((s) => s.step_number)).toEqual([1, 2]);
    expect(bundle.steps[1]!.prerequisites).toEqual([s1.id]);
  });
});

describe('skill tombstones', () => {
  it('listSkills/getSkillWithSteps/getAllSkillProgress κρύβουν σβησμένα', async () => {
    const skill = await createSkill({ name: 'One Arm Pull-up' });
    const step = await addSkillStep(skill.id, { name: 'Negative' });
    await achieveStep(skill.id, step.id, step.target_value);

    const t = new Date().toISOString();
    await db.skills.update(skill.id, { deleted_at: t, updated_at: t });

    expect((await listSkills(true)).some((s) => s.id === skill.id)).toBe(false);
    expect(await getSkillWithSteps(skill.id)).toBeNull();

    await db.user_skill_progress
      .where('user_id')
      .equals(UID)
      .modify({ deleted_at: t, updated_at: t });
    expect((await getAllSkillProgress()).size).toBe(0);
  });
});

describe('body metric tombstones', () => {
  it('οι readers κρύβουν tombstone και το save ανασταίνει το ίδιο row', async () => {
    await saveBodyMetric('2026-08-01', { weight_kg: 80 });
    expect((await getBodyMetric('2026-08-01'))?.weight_kg).toBe(80);

    const t = new Date().toISOString();
    await db.body_metrics
      .where('user_id')
      .equals(UID)
      .modify({ deleted_at: t, updated_at: t });

    expect(await getBodyMetric('2026-08-01')).toBeUndefined();
    expect(await getLatestBodyweight('2026-08-02')).toBeNull();
    const trend = await getBodyTrend(2);
    expect(trend.every((p) => p.weight == null)).toBe(true);

    await saveBodyMetric('2026-08-01', { weight_kg: 82 });
    const rows = await db.body_metrics.where('user_id').equals(UID).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deleted_at).toBeNull();
    expect(rows[0]!.weight_kg).toBe(82);
  });
});

describe('deleteProfile', () => {
  it('κάνει tombstone skills/steps/progress/completions/body αντί για hard delete', async () => {
    const skill = await createSkill({ name: 'Handstand' });
    const step = await addSkillStep(skill.id, { name: 'Wall' });
    await achieveStep(skill.id, step.id, step.target_value);
    await saveBodyMetric('2026-08-02', { weight_kg: 75 });
    await createScheduledSession({ date: '2026-08-03', title: 'Planned tombstone' });

    await deleteProfile(UID);

    const skills = await db.skills.toArray();
    const steps = await db.skill_steps.toArray();
    const progress = await db.user_skill_progress.toArray();
    const completions = await db.user_skill_step_completions.toArray();
    const body = await db.body_metrics.toArray();
    const scheduled = await db.scheduled_sessions.toArray();
    expect(skills.every((s) => s.deleted_at != null)).toBe(true);
    expect(steps.every((s) => s.deleted_at != null)).toBe(true);
    expect(progress.every((p) => p.deleted_at != null)).toBe(true);
    expect(completions.every((c) => c.deleted_at != null)).toBe(true);
    expect(body.every((m) => m.deleted_at != null)).toBe(true);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.deleted_at).toBeTruthy();

    expect(await getCurrentProfileDataCounts()).toMatchObject({ steps: 0, scheduled: 0 });
  });
});
