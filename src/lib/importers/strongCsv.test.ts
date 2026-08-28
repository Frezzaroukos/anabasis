import { describe, expect, it } from 'vitest';
import { parseStrongCsv } from './strongCsv';

/**
 * Fixtures βασισμένα στα ΔΥΟ πραγματικά dialects του Strong export:
 * iOS (comma, χωρίς unit στήλες) και Android (semicolon, με Weight Unit).
 * Ο parser πρέπει να τα διαβάζει και τα δύο χωρίς να του πεις ποιο είναι.
 */

const IOS_CSV = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2025-01-15 17:45:32,"Push Day",1h 30m,"Bench Press (Barbell)",W,40,10,,,,"felt strong",
2025-01-15 17:45:32,"Push Day",1h 30m,"Bench Press (Barbell)",1,80,8,,,,"felt strong",8
2025-01-15 17:45:32,"Push Day",1h 30m,"Bench Press (Barbell)",2,80,6,,,"grip, slipped","felt strong",9
2025-01-15 17:45:32,"Push Day",1h 30m,"Overhead Press (Barbell)",1,50,5,,,,"felt strong",
2025-01-17 09:12:00,"Core",45m,"Plank",1,,,,60,,,
`;

const ANDROID_CSV = `Date;Workout Name;Exercise Name;Set Order;Weight;Weight Unit;Reps;RPE;Distance;Distance Unit;Seconds;Notes;Workout Notes;Workout Duration
2025-02-01 10:00:00;Pull Day;Deadlift (Barbell);1;225;lbs;5;9;;;0;;;45m
2025-02-01 10:00:00;Pull Day;Deadlift (Barbell);2;225;lbs;5;;;;0;;;45m
`;

describe('parseStrongCsv — iOS format (comma)', () => {
  it('ομαδοποιεί σε workouts ανά ημερομηνία+όνομα και κρατά τα σετ σε σειρά', () => {
    const { workouts, badRows } = parseStrongCsv(IOS_CSV);
    expect(badRows).toHaveLength(0);
    expect(workouts).toHaveLength(2);

    const push = workouts[0]!;
    expect(push.date).toBe('2025-01-15');
    expect(push.name).toBe('Push Day');
    expect(push.notes).toBe('felt strong');
    expect(push.durationSeconds).toBe(90 * 60);
    expect(push.exercises.map((e) => e.name)).toEqual([
      'Bench Press (Barbell)',
      'Overhead Press (Barbell)',
    ]);
    expect(push.exercises[0]!.sets).toHaveLength(3);
    // η πραγματική ώρα έναρξης διατηρείται — όχι η ώρα του import
    expect(new Date(push.startedAtIso).getHours()).toBe(17);
  });

  it('«W» στο Set Order = warmup, τα υπόλοιπα normal με RPE', () => {
    const { workouts } = parseStrongCsv(IOS_CSV);
    const sets = workouts[0]!.exercises[0]!.sets;
    expect(sets[0]!.isWarmup).toBe(true);
    expect(sets[0]!.setType).toBe('warmup');
    expect(sets[1]!.isWarmup).toBe(false);
    expect(sets[1]!.rpe).toBe(8);
    expect(sets[1]!.weightKg).toBe(80);
    expect(sets[1]!.reps).toBe(8);
    // quoted πεδίο με κόμμα μέσα δεν σπάει τη γραμμή
    expect(sets[2]!.notes).toBe('grip, slipped');
  });

  it('σετ μόνο με Seconds (plank) γίνεται hold', () => {
    const { workouts } = parseStrongCsv(IOS_CSV);
    const core = workouts[1]!;
    expect(core.exercises[0]!.name).toBe('Plank');
    expect(core.exercises[0]!.sets[0]!.holdSeconds).toBe(60);
    expect(core.exercises[0]!.sets[0]!.weightKg).toBeNull();
  });
});

describe('parseStrongCsv — Android format (semicolon + units)', () => {
  it('κάνει sniff το «;» και μετατρέπει lbs σε kg', () => {
    const { workouts, badRows } = parseStrongCsv(ANDROID_CSV);
    expect(badRows).toHaveLength(0);
    expect(workouts).toHaveLength(1);
    const dl = workouts[0]!.exercises[0]!;
    // 225 lb × 0.45359237 = 102.06 kg
    expect(dl.sets[0]!.weightKg).toBeCloseTo(102.06, 2);
    expect(workouts[0]!.durationSeconds).toBe(45 * 60);
  });
});

describe('parseStrongCsv — ελαττωματικά δεδομένα', () => {
  it('χαλασμένη ημερομηνία και άδειο σετ γίνονται badRows, όχι σιωπηλό skip', () => {
    const csv = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
oxi-hmerominia,"A",30m,"Bench Press",1,60,5,,,,,
2025-03-01 10:00:00,"A",30m,"Rest Timer",1,,,,,,,
2025-03-01 10:00:00,"A",30m,"Bench Press",1,60,5,,,,,`;
    const { workouts, badRows } = parseStrongCsv(csv);
    expect(workouts).toHaveLength(1);
    expect(workouts[0]!.exercises[0]!.sets).toHaveLength(1);
    expect(badRows.map((b) => b.reason).sort()).toEqual(['bad-date', 'empty-set']);
  });

  it('RPE εκτός 1-10 μηδενίζεται και σημαδεύει το σετ ως ύποπτο', () => {
    const csv = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2025-03-01 10:00:00,"A",30m,"Bench Press",1,60,5,,,,,55`;
    const { workouts } = parseStrongCsv(csv);
    const set = workouts[0]!.exercises[0]!.sets[0]!;
    expect(set.rpe).toBeNull();
    expect(set.suspect).toBe(true);
  });

  it('αρχείο χωρίς τις στήλες του Strong απορρίπτεται με μήνυμα', () => {
    const { workouts, badRows } = parseStrongCsv('foo,bar\n1,2\n');
    expect(workouts).toHaveLength(0);
    expect(badRows[0]!.reason).toBe('missing-columns');
  });

  it('κενό κείμενο δεν σκάει', () => {
    expect(parseStrongCsv('')).toEqual({ workouts: [], badRows: [] });
  });
});
