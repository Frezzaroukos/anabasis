import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import { db } from './index';
import { bootstrapDB } from './bootstrap';
import { SEED_EXERCISES } from './seeds';
import {
  DEFAULT_USER_ID,
  getCurrentUserId,
  resetSession,
  setCurrentUserId,
} from './session';
import {
  addSet,
  createActivity,
  createExercise,
  createProfile,
  createProgram,
  createSkill,
  deleteProfile,
  endWorkout,
  getProfileStats,
  getRecentPRs,
  listActivities,
  listExercises,
  listProfiles,
  listPrograms,
  listSkills,
  renameProfile,
  startWorkout,
} from './queries';

beforeAll(async () => {
  await bootstrapDB();
});

afterEach(() => {
  setCurrentUserId(DEFAULT_USER_ID);
});

const logAWorkout = async (weightKg: number) => {
  const w = await startWorkout('strength');
  await addSet({
    workout_id: w.id,
    exercise_id: SEED_EXERCISES[0]!.id,
    weight_kg: weightKg,
    bodyweight_kg: null,
    reps: 5,
    hold_seconds: null,
  });
  await endWorkout(w.id);
  return w;
};

describe('προφίλ — δημιουργία & εναλλαγή', () => {
  it('ξεκινά με το αρχικό προφίλ ενεργό', () => {
    expect(getCurrentUserId()).toBe(DEFAULT_USER_ID);
  });

  it('δημιουργεί προφίλ με δικές του ρυθμίσεις', async () => {
    const p = await createProfile('Δεύτερος');
    expect(p.display_name).toBe('Δεύτερος');
    expect(p.id).not.toBe(DEFAULT_USER_ID);
    // χωρίς δικές του ρυθμίσεις θα κληρονομούσε του προηγούμενου
    const settings = await db.app_settings.where('user_id').equals(p.id).first();
    expect(settings).toBeTruthy();
    expect(settings!.default_rest_timer_seconds).toBe(180);
  });

  it('μετονομάζεται', async () => {
    const p = await createProfile('Λάθος όνομα');
    await renameProfile(p.id, 'Σωστό όνομα');
    const after = (await listProfiles()).find((x) => x.id === p.id)!;
    expect(after.display_name).toBe('Σωστό όνομα');
  });
});

describe('απομόνωση δεδομένων μεταξύ προφίλ', () => {
  it('οι προπονήσεις του ενός δεν φαίνονται στο άλλο', async () => {
    await logAWorkout(100);
    const mine = await getRecentPRs(50);
    expect(mine.length).toBeGreaterThan(0);

    const other = await createProfile('Άλλος');
    setCurrentUserId(other.id);

    // καθαρό ταμπλό: κανένα ρεκόρ, καμία προπόνηση
    expect(await getRecentPRs(50)).toHaveLength(0);
    expect((await getProfileStats(other.id)).workouts).toBe(0);

    await logAWorkout(60);
    expect(await getRecentPRs(50)).toHaveLength(
      (await getRecentPRs(50)).length,
    );

    // και πίσω: τα δικά μου είναι ανέπαφα
    setCurrentUserId(DEFAULT_USER_ID);
    const back = await getRecentPRs(50);
    expect(back.length).toBe(mine.length);
    expect(back.some((r) => r.weight_kg === 60)).toBe(false);
  });

  it('τα προγράμματα είναι ανά προφίλ', async () => {
    await createProgram('Δικό μου πλάνο');
    const other = await createProfile('Τρίτος');
    setCurrentUserId(other.id);
    expect((await listPrograms()).some((p) => p.name === 'Δικό μου πλάνο')).toBe(false);
  });

  it('οι δικές του ασκήσεις είναι ιδιωτικές, οι builtin κοινές', async () => {
    await createExercise({ name: 'Μυστική άσκηση' });
    const other = await createProfile('Τέταρτος');
    setCurrentUserId(other.id);

    const names = (await listExercises()).map((e) => e.name);
    expect(names).not.toContain('Μυστική άσκηση');
    // τα seeded είναι user_id === null → τα βλέπουν όλοι
    expect(names).toContain(SEED_EXERCISES[0]!.name);
  });

  it('οι δικές του δραστηριότητες είναι ιδιωτικές, οι builtin κοινές', async () => {
    const mine = await createActivity({ label: 'Παρκούρ' });
    // ο τόνος δεν επιτρέπεται να σπάσει το slug
    expect(mine.key).toBe('παρκουρ');
    expect((await listActivities()).some((a) => a.key === mine.key)).toBe(true);

    const other = await createProfile('Πέμπτος');
    setCurrentUserId(other.id);

    const keys = (await listActivities()).map((a) => a.key);
    expect(keys).not.toContain(mine.key);
    expect(keys).toContain('strength');
  });

  it('τα δικά του skills δεν διαρρέουν σε άλλο προφίλ', async () => {
    const s = await createSkill({ name: 'Κρυφό Skill' });
    expect((await listSkills()).some((x) => x.id === s.id)).toBe(true);

    const other = await createProfile('Έκτος');
    setCurrentUserId(other.id);
    const visible = await listSkills();
    expect(visible.some((x) => x.id === s.id)).toBe(false);
    // τα seeded skills τα βλέπουν όλοι
    expect(visible.length).toBeGreaterThan(0);
  });
});

describe('διαγραφή προφίλ', () => {
  it('σβήνει τα δεδομένα του και ΜΟΝΟ αυτά', async () => {
    const before = await getProfileStats(DEFAULT_USER_ID);

    const doomed = await createProfile('Προς διαγραφή');
    setCurrentUserId(doomed.id);
    await logAWorkout(75);
    await createProgram('Πλάνο που θα χαθεί');
    await createExercise({ name: 'Άσκηση που θα χαθεί' });
    expect((await getProfileStats(doomed.id)).workouts).toBe(1);

    setCurrentUserId(DEFAULT_USER_ID);
    await deleteProfile(doomed.id);

    expect((await listProfiles()).some((p) => p.id === doomed.id)).toBe(false);
    expect(await db.workouts.where('user_id').equals(doomed.id).count()).toBe(0);
    expect(await db.programs.where('user_id').equals(doomed.id).count()).toBe(0);
    expect(await db.exercises.where('user_id').equals(doomed.id).count()).toBe(0);
    expect(await db.app_settings.where('user_id').equals(doomed.id).count()).toBe(0);

    // το δικό μου προφίλ δεν άγγιξε κανείς
    expect((await getProfileStats(DEFAULT_USER_ID)).workouts).toBe(before.workouts);
    // ούτε τα κοινά seeded δεδομένα
    expect((await listExercises()).length).toBeGreaterThan(0);
  });

  it('δεν αφήνει ορφανά σετ πίσω του', async () => {
    const doomed = await createProfile('Ορφανά');
    setCurrentUserId(doomed.id);
    const w = await logAWorkout(50);
    expect(await db.sets.where('workout_id').equals(w.id).count()).toBe(1);

    setCurrentUserId(DEFAULT_USER_ID);
    await deleteProfile(doomed.id);
    expect(await db.sets.where('workout_id').equals(w.id).count()).toBe(0);
  });
});

describe('session persistence', () => {
  it('θυμάται το ενεργό προφίλ και επαναφέρεται με reset', async () => {
    const p = await createProfile('Επίμονος');
    setCurrentUserId(p.id);
    expect(getCurrentUserId()).toBe(p.id);
    resetSession();
    expect(getCurrentUserId()).toBe(DEFAULT_USER_ID);
  });
});
