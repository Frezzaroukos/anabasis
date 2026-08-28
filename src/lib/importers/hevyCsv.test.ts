import { describe, expect, it } from 'vitest';
import { parseHevyCsv } from './hevyCsv';

/**
 * Fixture στο τρέχον Hevy export format: μία γραμμή ανά σετ, ώρες τύπου
 * «22 Dec 2025, 08:00», set_type με warmup/failure/dropset, weight_kg
 * πάντα σε κιλά.
 */

const HEVY_CSV = `title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe
"Push","22 Dec 2025, 08:00","22 Dec 2025, 09:10","big day","Bench Press (Barbell)",,,0,warmup,40,10,,,
"Push","22 Dec 2025, 08:00","22 Dec 2025, 09:10","big day","Bench Press (Barbell)",,"paused reps",1,normal,82.5,8,,,8.5
"Push","22 Dec 2025, 08:00","22 Dec 2025, 09:10","big day","Bench Press (Barbell)",,,2,failure,82.5,6,,,
"Push","22 Dec 2025, 08:00","22 Dec 2025, 09:10","big day","Lateral Raise (Dumbbell)",,,0,dropset,10,15,,,
"Abs","23 Dec 2025, 18:30","23 Dec 2025, 18:50",,"Plank",,,0,normal,,,,90,
`;

describe('parseHevyCsv', () => {
  it('ομαδοποιεί ανά title+start_time και υπολογίζει διάρκεια από το end_time', () => {
    const { workouts, badRows } = parseHevyCsv(HEVY_CSV);
    expect(badRows).toHaveLength(0);
    expect(workouts).toHaveLength(2);

    const push = workouts[0]!;
    expect(push.date).toBe('2025-12-22');
    expect(push.name).toBe('Push');
    expect(push.notes).toBe('big day');
    expect(push.durationSeconds).toBe(70 * 60);
    expect(push.exercises.map((e) => e.name)).toEqual([
      'Bench Press (Barbell)',
      'Lateral Raise (Dumbbell)',
    ]);
    expect(new Date(push.startedAtIso).getHours()).toBe(8);
  });

  it('χαρτογραφεί set_type: warmup/failure flags, dropset αυτούσιο', () => {
    const { workouts } = parseHevyCsv(HEVY_CSV);
    const bench = workouts[0]!.exercises[0]!.sets;
    expect(bench[0]!.isWarmup).toBe(true);
    expect(bench[1]!.setType).toBe('normal');
    expect(bench[1]!.weightKg).toBe(82.5);
    expect(bench[1]!.rpe).toBe(8.5);
    expect(bench[1]!.notes).toBe('paused reps');
    expect(bench[2]!.isFailure).toBe(true);
    expect(bench[2]!.setType).toBe('failure');
    expect(workouts[0]!.exercises[1]!.sets[0]!.setType).toBe('dropset');
  });

  it('duration_seconds γίνεται hold (plank) και το 1-based νούμερο σετ δικό μας', () => {
    const { workouts } = parseHevyCsv(HEVY_CSV);
    const plank = workouts[1]!.exercises[0]!.sets[0]!;
    expect(plank.holdSeconds).toBe(90);
    expect(plank.setNumber).toBe(1); // το set_index του Hevy είναι 0-based
  });

  it('χαλασμένη ώρα ή γραμμή χωρίς μετρήσεις → badRow, τα υπόλοιπα περνάνε', () => {
    const csv = `title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe
"A","xx Foo 2025, 99:99",,,"Squat",,,0,normal,100,5,,,
"A","22 Dec 2025, 08:00",,,"Squat",,,0,normal,,,,,
"A","22 Dec 2025, 08:00",,,"Squat",,,1,normal,100,5,,,`;
    const { workouts, badRows } = parseHevyCsv(csv);
    expect(workouts).toHaveLength(1);
    expect(workouts[0]!.exercises[0]!.sets).toHaveLength(1);
    expect(badRows.map((b) => b.reason).sort()).toEqual(['bad-date', 'empty-set']);
  });

  it('δέχεται και ISO-like ώρες παλιότερων exports', () => {
    const csv = `title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe
"A","2025-12-22 08:00:00",,,"Squat",,,0,normal,100,5,,,`;
    const { workouts } = parseHevyCsv(csv);
    expect(workouts[0]!.date).toBe('2025-12-22');
  });

  it('αρχείο χωρίς τις στήλες του Hevy απορρίπτεται με μήνυμα', () => {
    const { workouts, badRows } = parseHevyCsv('foo,bar\n1,2\n');
    expect(workouts).toHaveLength(0);
    expect(badRows[0]!.reason).toBe('missing-columns');
  });
});
