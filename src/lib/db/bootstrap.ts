/**
 * One-time DB bootstrap on app start:
 *  - Seed system data (exercises, skills, skill steps) if missing.
 *  - Ensure a local user row exists.
 *  - Ensure default app_settings row exists.
 *
 * Idempotent: safe to call on every app boot.
 */

import { v4 as uuid } from 'uuid';
import { db, SCHEMA_VERSION } from './schema';
import { SEED_EXERCISES, SEED_SKILLS, SEED_SKILL_STEPS } from './seeds';
import type { AppSettings, User } from './types';

export const LOCAL_USER_ID = 'local-user-00000-0000-4000-8000-000000000001';

export async function bootstrapDB(): Promise<void> {
  await db.open();
  const now = new Date().toISOString();

  await db.transaction(
    'rw',
    [db.users, db.app_settings, db.exercises, db.skills, db.skill_steps],
    async () => {
      const userExists = await db.users.get(LOCAL_USER_ID);
      if (!userExists) {
        const user: User = {
          id: LOCAL_USER_ID,
          email: null,
          display_name: null,
          units: 'metric',
          bodyweight_unit: 'kg',
          language: 'en',
          schema_version: SCHEMA_VERSION,
          created_at: now,
          updated_at: now,
          is_pro: false,
          pro_expires_at: null,
        };
        await db.users.add(user);
      }

      const settingsExists = await db.app_settings
        .where('user_id')
        .equals(LOCAL_USER_ID)
        .first();
      if (!settingsExists) {
        const settings: AppSettings = {
          id: uuid(),
          user_id: LOCAL_USER_ID,
          default_rest_timer_seconds: 180,
          notify_pr: true,
          notify_session_reminder: false,
          reminder_time: null,
          reminder_days: [],
          show_e1rm: true,
          weight_unit: 'kg',
          theme: 'dark',
          created_at: now,
          updated_at: now,
        };
        await db.app_settings.add(settings);
      }

      const exerciseCount = await db.exercises.count();
      if (exerciseCount === 0) {
        const stamped = SEED_EXERCISES.map((e) => ({
          ...e,
          created_at: now,
          updated_at: now,
        }));
        await db.exercises.bulkAdd(stamped);
      }

      const skillCount = await db.skills.count();
      if (skillCount === 0) {
        const stampedSkills = SEED_SKILLS.map((s) => ({
          ...s,
          created_at: now,
          updated_at: now,
        }));
        const stampedSteps = SEED_SKILL_STEPS.map((s) => ({
          ...s,
          created_at: now,
          updated_at: now,
        }));
        await db.skills.bulkAdd(stampedSkills);
        await db.skill_steps.bulkAdd(stampedSteps);
      }
    },
  );
}
