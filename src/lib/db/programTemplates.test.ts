import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import {
  createProgramFromTemplate,
  getProgramWithExercises,
  listAllExercises,
  createExercise,
} from './queries';
import { PROGRAM_TEMPLATES, getTemplate } from '../programTemplates';

/**
 * Τα έτοιμα προγράμματα: το apply πρέπει να αντιστοιχίζει ονόματα στη
 * βιβλιοθήκη, να φτιάχνει ό,τι λείπει, να κρατά targets, και κάθε φορά να
 * γεννά ΝΕΟ πρόγραμμα (fork).
 */
beforeEach(async () => {
  setCurrentUserId('templates-test-profile');
  await db.programs.clear();
  await db.program_exercises.clear();
  await db.exercises.clear();
});

function apply(id: string) {
  const tpl = getTemplate(id)!;
  return createProgramFromTemplate({ name: tpl.nameKey, exercises: tpl.exercises });
}

describe('program templates', () => {
  it('δημιουργεί πρόγραμμα με τον σωστό αριθμό ασκήσεων και targets', async () => {
    const tpl = getTemplate('full-body-5x5')!;
    const program = await apply('full-body-5x5');
    const withEx = await getProgramWithExercises(program.id);
    expect(withEx?.exercises).toHaveLength(tpl.exercises.length);
    const byId = new Map((await listAllExercises()).map((e) => [e.id, e.name]));
    const squat = withEx!.exercises.find((e) => byId.get(e.exercise_id) === 'Back Squat');
    expect(squat?.target_sets).toBe(5);
    expect(squat?.target_reps).toBe(5);
  });

  it('δημιουργεί ασκήσεις που λείπουν από τη βιβλιοθήκη', async () => {
    expect(await listAllExercises()).toHaveLength(0);
    await apply('calisthenics-foundations');
    const names = (await listAllExercises()).map((e) => e.name);
    expect(names).toContain('L-Sit');
    expect(names).toContain('Pull-ups');
  });

  it('αντιστοιχίζει σε υπάρχουσα άσκηση case-insensitive, δεν διπλασιάζει', async () => {
    await createExercise({ name: 'Bench Press' });
    await apply('beginner-barbell');
    const benches = (await listAllExercises()).filter((e) => e.name.toLowerCase() === 'bench press');
    expect(benches).toHaveLength(1);
  });

  it('κάθε εφαρμογή = ξεχωριστό πρόγραμμα (fork)', async () => {
    const a = await apply('upper-lower');
    const b = await apply('upper-lower');
    expect(a.id).not.toBe(b.id);
    expect(await db.programs.count()).toBe(2);
  });

  it('κρατά hold_seconds για isometric ασκήσεις', async () => {
    const program = await apply('calisthenics-foundations');
    const withEx = await getProgramWithExercises(program.id);
    const byId = new Map((await listAllExercises()).map((e) => [e.id, e.name]));
    const lsit = withEx!.exercises.find((e) => byId.get(e.exercise_id) === 'L-Sit');
    expect(lsit?.target_hold_seconds).toBe(20);
    expect(lsit?.target_reps).toBeNull();
  });

  it('όλα τα πρότυπα εφαρμόζονται χωρίς σφάλμα', async () => {
    for (const tpl of PROGRAM_TEMPLATES) {
      const p = await createProgramFromTemplate({ name: tpl.nameKey, exercises: tpl.exercises });
      expect(p.id).toBeTruthy();
    }
  });
});
