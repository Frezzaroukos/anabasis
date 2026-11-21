/**
 * «Διαγραφή όλων των δεδομένων» για το ΕΝΕΡΓΟ προφίλ.
 *
 * Τι μένει σκόπιμα:
 *  - το ίδιο το προφίλ (`users`) και οι ρυθμίσεις του (`app_settings`) —
 *    αλλιώς η εφαρμογή θα ξανα-έφτιαχνε προφίλ με άλλα defaults,
 *  - τα builtin/seeded rows (`user_id === null`) — είναι κοινά σε όλα τα
 *    προφίλ της συσκευής, όχι «δικά σου».
 *
 * Ό,τι έχει `deleted_at` σημαδεύεται (tombstone) ώστε η διαγραφή να φύγει
 * και με sync. Αυτό ισχύει πλέον για ΟΛΟΥΣ τους user-data πίνακες,
 * συμπεριλαμβανομένων των skills/skill_steps, user_skill_progress,
 * user_skill_step_completions, body_metrics και personal_records (Wave 2 +
 * lane A PR tombstones).
 *
 * Όλο το σβήσιμο σε ΜΙΑ transaction: ή φεύγουν όλα ή τίποτα.
 */
import { db } from './schema';
import { getCurrentUserId } from './session';
import { USER_DATA_TABLES } from './queries';

const now = () => new Date().toISOString();

export interface WipeResult {
  counts: Record<string, number>;
}

export async function deleteCurrentProfileData(): Promise<WipeResult> {
  const uid = getCurrentUserId();
  const t = now();
  const tables = USER_DATA_TABLES();
  const counts: Record<string, number> = {};
  const bump = (table: string, n: number) => {
    if (n > 0) counts[table] = (counts[table] ?? 0) + n;
  };

  await db.transaction('rw', Object.values(tables), async () => {
    // 1) Παιδιά πρώτα (χωρίς δικό τους user_id), μέσω των γονικών ids.
    const workoutIds = (
      await db.workouts.where('user_id').equals(uid).toArray()
    ).map((w) => w.id);
    if (workoutIds.length > 0) {
      bump(
        'sets',
        await db.sets
          .where('workout_id')
          .anyOf(workoutIds)
          .and((s) => s.deleted_at == null)
          .modify({ deleted_at: t, updated_at: t }),
      );
    }
    bump(
      'workouts',
      await db.workouts
        .where('user_id')
        .equals(uid)
        .and((w) => w.deleted_at == null)
        .modify({ deleted_at: t, updated_at: t }),
    );

    const programIds = (
      await db.programs.where('user_id').equals(uid).toArray()
    ).map((p) => p.id);
    if (programIds.length > 0) {
      bump(
        'program_exercises',
        await db.program_exercises
          .where('program_id')
          .anyOf(programIds)
          .and((r) => r.deleted_at == null)
          .modify({ deleted_at: t, updated_at: t }),
      );
      bump(
        'program_days',
        await db.program_days
          .where('program_id')
          .anyOf(programIds)
          .and((d) => d.deleted_at == null)
          .modify({ deleted_at: t, updated_at: t }),
      );
    }
    bump(
      'programs',
      await db.programs
        .where('user_id')
        .equals(uid)
        .and((p) => p.deleted_at == null)
        .modify({ deleted_at: t, updated_at: t }),
    );

    // 2) Δικά σου custom skills + τα βήματά τους.
    const skillIds = (
      await db.skills.where('user_id').equals(uid).toArray()
    ).map((s) => s.id);
    if (skillIds.length > 0) {
      bump(
        'skill_steps',
        await db.skill_steps
          .where('skill_id')
          .anyOf(skillIds)
          .and((s) => s.deleted_at == null)
          .modify({ deleted_at: t, updated_at: t }),
      );
    }
    bump(
      'skills',
      await db.skills
        .where('user_id')
        .equals(uid)
        .and((s) => s.deleted_at == null)
        .modify({ deleted_at: t, updated_at: t }),
    );

    // 3) Παράγωγα PRs — tombstone (lane A), όχι hard delete.
    bump(
      'personal_records',
      await db.personal_records
        .where('user_id')
        .equals(uid)
        .and((r) => r.deleted_at == null)
        .modify({ deleted_at: t, updated_at: t }),
    );
    bump(
      'user_skill_progress',
      await db.user_skill_progress
        .where('user_id')
        .equals(uid)
        .and((p) => p.deleted_at == null)
        .modify({ deleted_at: t, updated_at: t }),
    );
    bump(
      'user_skill_step_completions',
      await db.user_skill_step_completions
        .where('user_id')
        .equals(uid)
        .and((c) => c.deleted_at == null)
        .modify({ deleted_at: t, updated_at: t }),
    );

    // 4) Υπόλοιποι direct-owner πίνακες με soft delete.
    bump(
      'exercises',
      await db.exercises
        .where('user_id')
        .equals(uid)
        .and((e) => e.deleted_at == null)
        .modify({ deleted_at: t, updated_at: t }),
    );
    bump(
      'activities',
      await db.activities
        .where('user_id')
        .equals(uid)
        .and((a) => a.deleted_at == null)
        .modify({ deleted_at: t, updated_at: t }),
    );
    bump(
      'goals',
      await db.goals
        .where('user_id')
        .equals(uid)
        .and((g) => g.deleted_at == null)
        .modify({ deleted_at: t, updated_at: t }),
    );
    bump(
      'body_metrics',
      await db.body_metrics
        .where('user_id')
        .equals(uid)
        .and((m) => m.deleted_at == null)
        .modify({ deleted_at: t, updated_at: t }),
    );
    bump(
      'custom_tracker_entries',
      await db.custom_tracker_entries
        .where('user_id')
        .equals(uid)
        .and((e) => e.deleted_at == null)
        .modify({ deleted_at: t, updated_at: t }),
    );
    bump(
      'custom_trackers',
      await db.custom_trackers
        .where('user_id')
        .equals(uid)
        .and((x) => x.deleted_at == null)
        .modify({ deleted_at: t, updated_at: t }),
    );
    // Planned sessions είναι user data όπως τα workouts — χωρίς αυτό έμεναν
    // ορατές στο ημερολόγιο μετά το «Διαγραφή όλων» και ξανασυγχρονίζονταν.
    bump(
      'scheduled_sessions',
      await db.scheduled_sessions
        .where('user_id')
        .equals(uid)
        .and((s) => s.deleted_at == null)
        .modify({ deleted_at: t, updated_at: t }),
    );
  });

  return { counts };
}
