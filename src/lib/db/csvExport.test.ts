import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import { addSet, createExercise, endWorkout, startWorkout } from './queries';
import { csvCell, exportSetsCsv, exportWorkoutsCsv } from './csvExport';

/**
 * Το CSV είναι για ανάλυση, όχι για restore — γι' αυτό ελέγχουμε ότι κάθε
 * γραμμή είναι σωστά escaped (Excel), ότι μετράει ΜΟΝΟ το τρέχον προφίλ και
 * ότι οι soft-deleted εγγραφές δεν εμφανίζονται σαν «δεδομένα σου».
 */
beforeEach(async () => {
  setCurrentUserId('csv-export-test');
  await Promise.all([
    db.workouts.clear(),
    db.sets.clear(),
    db.exercises.clear(),
    db.activities.clear(),
    db.personal_records.clear(),
  ]);
});

describe('csvCell', () => {
  it('διπλασιάζει quotes και βάζει σε quotes πεδία με κόμμα/newline', () => {
    expect(csvCell('απλό')).toBe('απλό');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('γραμμή\nνέα')).toBe('"γραμμή\nνέα"');
    expect(csvCell(null)).toBe('');
  });
});

describe('exportWorkoutsCsv', () => {
  it('μία γραμμή ανά ολοκληρωμένη προπόνηση, με πλήθος σετ και escaping', async () => {
    await createExercise({ name: 'Back Squat' });
    const w = await startWorkout('strength', '2026-08-15', null, null, 'Heavy, "A"');
    await addSet({
      workout_id: w.id,
      exercise_id: (await db.exercises.toArray())[0]!.id,
      weight_kg: 100,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
    });
    await endWorkout(w.id, 3600);

    const csv = await exportWorkoutsCsv();
    expect(csv.startsWith('\uFEFFdate,workout,activity')).toBe(true);
    const lines = csv.slice(1).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('2026-08-15,"Heavy, ""A""",strength,3600,,1,');
  });

  it('κρύβει soft-deleted προπονήσεις και δεδομένα άλλου προφίλ', async () => {
    const ex = await createExercise({ name: 'Row' });
    const mine = await startWorkout('strength', '2026-08-14');
    await addSet({
      workout_id: mine.id,
      exercise_id: ex.id,
      weight_kg: 50,
      bodyweight_kg: null,
      reps: 10,
      hold_seconds: null,
    });
    await endWorkout(mine.id, 600);
    const deleted = await startWorkout('strength', '2026-08-13');
    await endWorkout(deleted.id, 600);
    await db.workouts.update(deleted.id, { deleted_at: new Date().toISOString() });

    setCurrentUserId('someone-else');
    const other = await startWorkout('strength', '2026-08-12');
    await endWorkout(other.id, 600);

    setCurrentUserId('csv-export-test');
    const csv = await exportWorkoutsCsv();
    expect(csv).toContain('2026-08-14');
    expect(csv).not.toContain('2026-08-13');
    expect(csv).not.toContain('2026-08-12');
  });
});

describe('exportSetsCsv', () => {
  it('μία γραμμή ανά σετ με όνομα άσκησης, volume και σωστή ημερομηνία', async () => {
    const ex = await createExercise({ name: 'Back Squat' });
    const w = await startWorkout('strength', '2026-08-15', null, null, 'Heavy');
    await addSet({
      workout_id: w.id,
      exercise_id: ex.id,
      weight_kg: 100,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
      set_type: 'normal',
    });

    const csv = await exportSetsCsv();
    expect(csv.startsWith('\uFEFFdate,workout,exercise')).toBe(true);
    const lines = csv.slice(1).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('2026-08-15,Heavy,Back Squat,1,100,5,,,,normal,500,');
  });
});
