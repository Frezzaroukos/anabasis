import { describe, expect, it } from 'vitest';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import type { Exercise } from '@/lib/db/types';
import { parseWorkoutNotes } from './parseWorkoutNotes';

const customExercises: Exercise[] = [
  ...SEED_EXERCISES,
  {
    id: 'ex-custom-mu',
    user_id: 'u1',
    name: 'Muscle Up',
    category: 'pull',
    movement_type: 'compound',
    equipment: [],
    is_weighted: true,
    is_bodyweight: true,
    default_unit: 'reps',
    notes: null,
    is_archived: false,
    created_at: '',
    updated_at: '',
    deleted_at: null,
  },
  {
    id: 'ex-custom-planche',
    user_id: 'u1',
    name: 'Planche Raise',
    category: 'push',
    movement_type: 'isolation',
    equipment: ['dumbbells'],
    is_weighted: true,
    is_bodyweight: false,
    default_unit: 'kg',
    notes: null,
    is_archived: false,
    created_at: '',
    updated_at: '',
    deleted_at: null,
  },
  {
    id: 'ex-custom-fl-row',
    user_id: 'u1',
    name: 'Front Lever Row',
    category: 'pull',
    movement_type: 'compound',
    equipment: [],
    is_weighted: true,
    is_bodyweight: false,
    default_unit: 'kg',
    notes: null,
    is_archived: false,
    created_at: '',
    updated_at: '',
    deleted_at: null,
  },
];

describe('parseWorkoutNotes — real-world workout notes paste', () => {
  it('parses an entire mixed Greek/English calisthenics + weights note with drop sets, half reps, and 4xmax', () => {
    const raw = `(.    Bw Mu :2+1+1+1
W.pull ups:30kg 5+4+3(drop set 10kg 7)
Biceps:26kg 2,5+1(drop set 18kg 10)16kg 10
Με βαράκια όρθιο ίσχυα χέρια για Blanche -reps;16kg 6
Bench :80kg 1 + 90kg 1 + 100kg 1 + 80kg 6
Tricep standing tall arms ;60kg 9+ 70kg 8(50kg 9)
Rows machine για sat(καλησθενικη άσκηση ):18kg 4xmax)`;

    const parsed = parseWorkoutNotes(raw, customExercises, 'kg');
    expect(parsed).toHaveLength(7);

    // 1. Bw Mu -> Muscle Up (4 BW sets)
    expect(parsed[0]!.matchedExerciseId).toBe('ex-custom-mu');
    expect(parsed[0]!.sets).toEqual([
      { weightKg: null, reps: 2 },
      { weightKg: null, reps: 1 },
      { weightKg: null, reps: 1 },
      { weightKg: null, reps: 1 },
    ]);

    // 2. W.pull ups -> Weighted Pull-ups (30kg 5,4,3 + drop 10kg 7)
    expect(parsed[1]!.matchedExerciseId).toBe('ex-00000000-0000-4000-8000-000000000010');
    expect(parsed[1]!.sets).toHaveLength(4);
    expect(parsed[1]!.sets[3]).toMatchObject({ weightKg: 10, reps: 7, setType: 'dropset' });

    // 3. Biceps -> Biceps Curls (26kg 2.5, 1 + drop 18kg 10 + 16kg 10)
    expect(parsed[2]!.matchedExerciseId).toBe('ex-00000000-0000-4000-8000-000000000006');
    expect(parsed[2]!.sets[0]).toEqual({ weightKg: 26, reps: 2.5 });
    expect(parsed[2]!.sets[2]).toMatchObject({ weightKg: 18, reps: 10, setType: 'dropset' });
    expect(parsed[2]!.sets[3]).toEqual({ weightKg: 16, reps: 10 });

    // 4. Blanche -> Planche Raise (16kg x 6)
    expect(parsed[3]!.matchedExerciseId).toBe('ex-custom-planche');
    expect(parsed[3]!.sets).toEqual([{ weightKg: 16, reps: 6 }]);

    // 5. Bench -> Bench Press (80x1, 90x1, 100x1, 80x6)
    expect(parsed[4]!.matchedExerciseId).toBe('ex-00000000-0000-4000-8000-000000000001');
    expect(parsed[4]!.sets.map((s) => [s.weightKg, s.reps])).toEqual([
      [80, 1],
      [90, 1],
      [100, 1],
      [80, 6],
    ]);

    // 6. Tricep standing tall arms -> Triceps Extension
    expect(parsed[5]!.matchedExerciseId).toBe('ex-00000000-0000-4000-8000-000000000022');
    expect(parsed[5]!.sets[2]).toMatchObject({ weightKg: 50, reps: 9, setType: 'dropset' });

    // 7. Rows machine για sat -> Front Lever Row (18kg 4xmax)
    expect(parsed[6]!.matchedExerciseId).toBe('ex-custom-fl-row');
    expect(parsed[6]!.sets).toHaveLength(4);
    expect(parsed[6]!.sets.every((s) => s.weightKg === 18 && s.reps === null && s.setType === 'amrap')).toBe(true);
  });

  it('flags suspicious numbers like a typo 1100kg for user review instead of silently guessing', () => {
    const parsed = parseWorkoutNotes('Bench : 80kg 1 + 90kg 1100kg 1', customExercises, 'kg');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.hasSuspectValues).toBe(true);
  });

  it('returns matchedExerciseId=null with cleaned suggestedName for unknown exercises', () => {
    const parsed = parseWorkoutNotes('Zanetti Fly: 14kg 8+8', customExercises, 'kg');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.matchedExerciseId).toBeNull();
    expect(parsed[0]!.suggestedName).toBe('Zanetti Fly');
    expect(parsed[0]!.sets).toEqual([
      { weightKg: 14, reps: 8 },
      { weightKg: 14, reps: 8 },
    ]);
  });

  it('ignores blank lines and non-set commentary lines', () => {
    const parsed = parseWorkoutNotes('\nFelt great today!\n\nBench: 100kg 5\n', customExercises, 'kg');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.matchedExerciseId).toBe('ex-00000000-0000-4000-8000-000000000001');
  });
});
