import { describe, expect, it, beforeAll } from 'vitest';
import { db } from './index';
import { bootstrapDB } from './bootstrap';
import { SEED_EXERCISES } from './seeds';
import {
  addSet,
  addSkillStep,
  createActivity,
  createExercise,
  createSkill,
  endWorkout,
  getSkillWithSteps,
  listActivities,
  listAllExercises,
  listExerciseCategories,
  listExercises,
  removeSkillStep,
  setExerciseArchived,
  startWorkout,
  updateActivity,
  updateExercise,
} from './queries';

beforeAll(async () => {
  await bootstrapDB();
});

describe('δικές σου ασκήσεις', () => {
  it('δέχεται κατηγορία εκτός των builtin — δεν την πετάει στο «other»', async () => {
    const e = await createExercise({ name: 'Wrist Roller', category: 'grip' });
    expect(e.category).toBe('grip');
    expect(e.user_id).not.toBeNull();
    expect(await listExerciseCategories()).toContain('grip');
  });

  it('φαίνεται κανονικά δίπλα στις builtin', async () => {
    await createExercise({ name: 'Ζυγισμένο Κρέμασμα' });
    const names = (await listExercises()).map((x) => x.name);
    expect(names).toContain('Ζυγισμένο Κρέμασμα');
  });

  it('η αρχειοθέτηση κρύβει από τον logger αλλά κρατά το ιστορικό', async () => {
    const e = await createExercise({ name: 'Πειραματική' });
    await setExerciseArchived(e.id, true);
    expect((await listExercises()).some((x) => x.id === e.id)).toBe(false);
    // στη διαχείριση φαίνεται ακόμα, ώστε να μπορείς να την επαναφέρεις
    expect((await listAllExercises()).some((x) => x.id === e.id)).toBe(true);
  });
});

describe('οι αλλαγές σε builtin δεδομένα επιβιώνουν του bootstrap', () => {
  it('αρχειοθετημένη builtin άσκηση ΔΕΝ επανέρχεται στο επόμενο άνοιγμα', async () => {
    const flag = SEED_EXERCISES.find((e) => e.name === 'Bench Press')!;
    await setExerciseArchived(flag.id, true);
    await updateExercise(flag.id, { notes: 'πονάει ο ώμος' });

    await bootstrapDB(); // δεύτερη εκκίνηση της εφαρμογής

    const after = (await db.exercises.get(flag.id))!;
    expect(after.is_archived).toBe(true);
    expect(after.notes).toBe('πονάει ο ώμος');
  });

  it('μετονομασμένη builtin δραστηριότητα κρατά το όνομά της', async () => {
    const run = (await listActivities(true)).find((a) => a.key === 'run')!;
    await updateActivity(run.id, { label: 'Τρέξιμο στην παραλία' });
    await bootstrapDB();
    const after = (await listActivities(true)).find((a) => a.key === 'run')!;
    expect(after.label).toBe('Τρέξιμο στην παραλία');
  });
});

describe('δικά σου skill trees', () => {
  it('φτιάχνει skill και αλυσιδώνει τα βήματα ως προαπαιτούμενα', async () => {
    const s = await createSkill({ name: 'Dragon Flag', category: 'core' });
    expect(s.short_code).toBe('DF');

    const a = await addSkillStep(s.id, { name: 'Negative', target_value: 5, target_unit: 'reps' });
    const b = await addSkillStep(s.id, { name: 'Tuck hold', target_value: 10 });
    const c = await addSkillStep(s.id, { name: 'Full', target_value: 15 });

    expect([a.step_number, b.step_number, c.step_number]).toEqual([1, 2, 3]);
    expect(a.prerequisites).toEqual([]);
    expect(b.prerequisites).toEqual([a.id]);
    expect(c.prerequisites).toEqual([b.id]);
  });

  it('η διαγραφή βήματος ξανα-αριθμεί και ξαναδένει την αλυσίδα (καμία τρύπα)', async () => {
    const s = await createSkill({ name: 'Human Flag Test' });
    const s1 = await addSkillStep(s.id, { name: 'Ένα' });
    const s2 = await addSkillStep(s.id, { name: 'Δύο' });
    const s3 = await addSkillStep(s.id, { name: 'Τρία' });

    await removeSkillStep(s2.id);

    const { steps } = (await getSkillWithSteps(s.id))!;
    expect(steps.map((x) => x.name)).toEqual(['Ένα', 'Τρία']);
    expect(steps.map((x) => x.step_number)).toEqual([1, 2]);
    // το «Τρία» δείχνει πλέον στο «Ένα», όχι σε διαγραμμένο βήμα
    expect(steps[1]!.prerequisites).toEqual([s1.id]);
    expect(steps[1]!.id).toBe(s3.id);
  });
});

describe('δικές σου δραστηριότητες', () => {
  it('παράγει slug key και δεν συγκρούεται με υπάρχον', async () => {
    const a = await createActivity({ label: 'Boxing', icon: '🥊', tracks_distance: false });
    const b = await createActivity({ label: 'Boxing' });
    expect(a.key).toBe('boxing');
    expect(b.key).toBe('boxing-2');
    expect(a.is_builtin).toBe(false);
  });

  it('χρησιμοποιείται σε πραγματικό workout σαν κάθε άλλη', async () => {
    const yoga = await createActivity({ label: 'Yoga', icon: '🧘' });
    const w = await startWorkout(yoga.key);
    await endWorkout(w.id);
    const saved = (await db.workouts.get(w.id))!;
    expect(saved.activity_kind).toBe('yoga');
  });
});

describe('ένταση σετ', () => {
  it('αποθηκεύει RPE, RIR και tempo', async () => {
    const ex = SEED_EXERCISES[0]!;
    const w = await startWorkout('strength');
    const s = await addSet({
      workout_id: w.id,
      exercise_id: ex.id,
      weight_kg: 80,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
      rpe: 8.5,
      rir: 2,
      tempo: '3-1-1-0',
    });
    expect(s.rpe).toBe(8.5);
    expect(s.rir).toBe(2);
    expect(s.tempo).toBe('3-1-1-0');
  });
});
