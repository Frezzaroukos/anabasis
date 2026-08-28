import { beforeAll, describe, expect, it } from 'vitest';
import { db } from './schema';
import { bootstrapDB } from './bootstrap';
import { DEFAULT_USER_ID, getCurrentUserId, setCurrentUserId } from './session';
import {
  addProgramExercise,
  addSet,
  addSkillStep,
  createExercise,
  createProfile,
  createProgram,
  createSkill,
  endWorkout,
  migrateProfileUserId,
  startWorkout,
} from './queries';
import { createGoal } from './goals';

/**
 * migrateProfileUserId() δένει ένα τοπικό προφίλ σε account.id κατά το
 * login/signup (server API-CONTRACT.md). Ελέγχουμε ότι ΟΛΑ τα δεδομένα
 * ακολουθούν — και τα paidiká (sets/program_exercises) που δεν έχουν δικό
 * τους user_id αλλά ανήκουν μέσω γονέα — και το guard όταν το newId υπάρχει
 * ήδη σε αυτή τη συσκευή.
 */

beforeAll(async () => {
  await bootstrapDB();
});

describe('migrateProfileUserId', () => {
  it('μετακινεί όλα τα δεδομένα ενός τοπικού προφίλ στο νέο account id', async () => {
    const profile = await createProfile('Προς σύνδεση');
    setCurrentUserId(profile.id);

    const exercise = await createExercise({ name: 'Migration Squat' });
    const workout = await startWorkout('strength');
    await addSet({
      workout_id: workout.id,
      exercise_id: exercise.id,
      weight_kg: 100,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
    });
    await endWorkout(workout.id);

    const program = await createProgram('Migration Push');
    await addProgramExercise(program.id, { exercise_id: exercise.id });

    const skill = await createSkill({ name: 'Migration Skill' });
    const step = await addSkillStep(skill.id, { name: 'Step 1' });

    await createGoal({ metric: 'sessions', target: 3, period: 'week' });

    const oldId = profile.id;
    const accountId = 'account-0000-0000-0000-000000000001';

    await migrateProfileUserId(oldId, accountId);

    expect(getCurrentUserId()).toBe(accountId);
    expect(await db.users.get(oldId)).toBeUndefined();
    const user = await db.users.get(accountId);
    expect(user?.display_name).toBe('Προς σύνδεση');

    expect(await db.exercises.where('user_id').equals(oldId).count()).toBe(0);
    expect(await db.exercises.where('user_id').equals(accountId).count()).toBe(1);
    expect(await db.workouts.where('user_id').equals(accountId).count()).toBe(1);
    expect(await db.programs.where('user_id').equals(accountId).count()).toBe(1);
    expect(await db.skills.where('user_id').equals(accountId).count()).toBe(1);
    expect((await db.goals.where('user_id').equals(accountId).toArray()).length).toBe(1);

    // παιδικοί πίνακες χωρίς δικό τους user_id — ακολουθούν μέσω γονέα, δεν
    // μετακινούνται οι ίδιοι αλλά παραμένουν προσβάσιμοι κανονικά
    expect(await db.sets.where('workout_id').equals(workout.id).count()).toBe(1);
    expect(
      await db.program_exercises.where('program_id').equals(program.id).count(),
    ).toBe(1);
    expect(await db.skill_steps.get(step.id)).toBeTruthy();

    setCurrentUserId(DEFAULT_USER_ID);
  });

  it('no-op όταν oldId === newId', async () => {
    const profile = await createProfile('Ίδιο id');
    setCurrentUserId(profile.id);
    await createExercise({ name: 'No-op Exercise' });

    await migrateProfileUserId(profile.id, profile.id);

    expect(getCurrentUserId()).toBe(profile.id);
    expect(await db.exercises.where('user_id').equals(profile.id).count()).toBe(1);

    setCurrentUserId(DEFAULT_USER_ID);
  });

  it('όταν το newId είναι ΗΔΗ δεμένο σε αυτή τη συσκευή, εναλλάσσει session αντί να συγχωνεύσει', async () => {
    const a = await createProfile('Προφίλ Α');
    setCurrentUserId(a.id);
    await createExercise({ name: 'Άσκηση Α' });

    const b = await createProfile('Προφίλ Β (ήδη δεμένο)');
    setCurrentUserId(b.id);
    await createExercise({ name: 'Άσκηση Β' });

    await migrateProfileUserId(a.id, b.id);

    expect(getCurrentUserId()).toBe(b.id);
    // κανένα από τα δύο σύνολα δεδομένων δεν πειράχτηκε
    expect(await db.exercises.where('user_id').equals(a.id).count()).toBe(1);
    expect(await db.exercises.where('user_id').equals(b.id).count()).toBe(1);
    expect(await db.users.get(a.id)).toBeTruthy();
    expect(await db.users.get(b.id)).toBeTruthy();

    setCurrentUserId(DEFAULT_USER_ID);
  });
});
