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
import {
  SEED_ACTIVITIES,
  SEED_EXERCISES,
  SEED_SKILLS,
  SEED_SKILL_STEPS,
} from './seeds';
import type { AppSettings, User } from './types';
import { getCurrentUserId, initSession } from './session';

export { DEFAULT_USER_ID as LOCAL_USER_ID } from './session';

export async function bootstrapDB(): Promise<void> {
  initSession();
  await db.open();
  // Το ενεργό προφίλ μπορεί να είναι δικό του (πολλαπλά προφίλ) ή το αρχικό.
  const activeUserId = getCurrentUserId();
  const now = new Date().toISOString();

  await db.transaction(
    'rw',
    [
      db.users,
      db.app_settings,
      db.exercises,
      db.skills,
      db.skill_steps,
      db.activities,
    ],
    async () => {
      const userExists = await db.users.get(activeUserId);
      if (!userExists) {
        const user: User = {
          id: activeUserId,
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
        .equals(activeUserId)
        .first();
      if (!settingsExists) {
        const settings: AppSettings = {
          id: uuid(),
          user_id: activeUserId,
          default_rest_timer_seconds: 180,
          notify_pr: true,
          notify_session_reminder: false,
          notify_rest_timer: true,
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

      /**
       * ΠΡΟΣΘΕΤΟΥΜΕ μόνο ό,τι λείπει — ΠΟΤΕ δεν γράφουμε πάνω σε υπάρχουσα
       * εγγραφή. Το παλιό `bulkPut` έσβηνε σε κάθε εκκίνηση ό,τι είχε αλλάξει
       * ο χρήστης σε builtin δεδομένα (μετονομασία, αρχειοθέτηση, σημειώσεις,
       * αλλαγμένοι στόχοι βημάτων). Το τίμημα είναι ότι διορθώσεις στα seeds
       * δεν φτάνουν σε παλιές εγκαταστάσεις — αποδεκτό: οι αλλαγές του χρήστη
       * βαραίνουν περισσότερο από τα δικά μας defaults.
       */
      const addMissing = async <T extends { id: string }>(
        table: { bulkGet(keys: string[]): Promise<(T | undefined)[]>; bulkAdd(rows: T[]): Promise<unknown> },
        rows: T[],
      ) => {
        const found = await table.bulkGet(rows.map((r) => r.id));
        const missing = rows.filter((_, i) => found[i] === undefined);
        if (missing.length > 0) await table.bulkAdd(missing);
        return missing.length;
      };

      await addMissing(
        db.exercises,
        SEED_EXERCISES.map((e) => ({ ...e, created_at: now, updated_at: now })),
      );
      await addMissing(
        db.skills,
        SEED_SKILLS.map((s) => ({ ...s, created_at: now, updated_at: now })),
      );
      await addMissing(
        db.skill_steps,
        SEED_SKILL_STEPS.map((s) => ({ ...s, created_at: now, updated_at: now })),
      );
      await addMissing(
        db.activities,
        SEED_ACTIVITIES.map((a) => ({ ...a, created_at: now, updated_at: now })),
      );
    },
  );
}
