import { describe, expect, it } from 'vitest';
import {
  suggestNextForExercise,
  detectDeloadRisk,
  planNextPeriod,
  type LastExercisePerformance,
  type NextPeriodPlan,
} from './coach';

describe('suggestNextForExercise', () => {
  it('επιστρέφει null όταν δεν υπάρχει ιστορικό', () => {
    const result = suggestNextForExercise(null);
    expect(result).toBeNull();
  });

  describe('Regular exercises (non-hold)', () => {
    it('προτείνει +1 rep όταν δεν έπιασε το target', () => {
      const perf: LastExercisePerformance = {
        id: '1',
        exercise_id: 'pull-up',
        exercise_name: 'Pull-up',
        max_reps_in_set: 8,
        target_reps: 10,
        top_weight_kg: 0,
        is_body_weight: true,
        completed_all_reps: false,
        is_hold_exercise: false,
      };

      const result = suggestNextForExercise(perf);
      expect(result).toBeTruthy();
      expect(result?.kind).toBe('add_rep');
      expect(result?.text).toContain('9 reps');
    });

    it('προτείνει +2.5kg όταν έπιασε το target (weighted)', () => {
      const perf: LastExercisePerformance = {
        id: '2',
        exercise_id: 'weighted-dip',
        exercise_name: 'Weighted Dip',
        max_reps_in_set: 10,
        target_reps: 10,
        top_weight_kg: 20,
        is_body_weight: false,
        completed_all_reps: true,
        is_hold_exercise: false,
      };

      const result = suggestNextForExercise(perf);
      expect(result).toBeTruthy();
      expect(result?.kind).toBe('add_weight');
      expect(result?.text).toContain('22.5');
      expect(result?.text).toContain('2.5');
    });

    it('προτείνει +1kg όταν έπιασε το target (bodyweight)', () => {
      const perf: LastExercisePerformance = {
        id: '3',
        exercise_id: 'pseudo-planche',
        exercise_name: 'Pseudo Planche',
        max_reps_in_set: 5,
        target_reps: 5,
        top_weight_kg: 50,
        is_body_weight: true,
        completed_all_reps: true,
        is_hold_exercise: false,
      };

      const result = suggestNextForExercise(perf);
      expect(result).toBeTruthy();
      expect(result?.kind).toBe('add_weight');
      expect(result?.text).toContain('51');
      expect(result?.text).toContain('+1');
    });
  });

  describe('Hold exercises', () => {
    it('επιστρέφει null χωρίς hold timing data', () => {
      const perf: LastExercisePerformance = {
        id: '4',
        exercise_id: 'l-sit',
        exercise_name: 'L-sit hold',
        max_reps_in_set: 0,
        target_reps: 0,
        top_weight_kg: 0,
        is_body_weight: true,
        completed_all_reps: false,
        is_hold_exercise: true,
        // missing max_hold_seconds, target_hold_seconds
      };

      const result = suggestNextForExercise(perf);
      expect(result).toBeNull();
    });

    it('προτείνει +χρόνο (hold)', () => {
      const perf: LastExercisePerformance = {
        id: '5',
        exercise_id: 'l-sit',
        exercise_name: 'L-sit hold',
        max_reps_in_set: 0,
        target_reps: 0,
        top_weight_kg: 0,
        is_body_weight: true,
        completed_all_reps: false,
        is_hold_exercise: true,
        max_hold_seconds: 20,
        target_hold_seconds: 30,
      };

      const result = suggestNextForExercise(perf);
      expect(result).toBeTruthy();
      expect(result?.kind).toBe('add_hold');
      expect(result?.text).toContain('Hold');
      expect(result?.text).toContain('25');
    });

    it('cap hold time στο target + 10s buffer', () => {
      const perf: LastExercisePerformance = {
        id: '6',
        exercise_id: 'handstand',
        exercise_name: 'Handstand hold',
        max_reps_in_set: 0,
        target_reps: 0,
        top_weight_kg: 0,
        is_body_weight: true,
        completed_all_reps: false,
        is_hold_exercise: true,
        max_hold_seconds: 45,
        target_hold_seconds: 50,
      };

      const result = suggestNextForExercise(perf);
      expect(result).toBeTruthy();
      expect(result?.kind).toBe('add_hold');
      // max(45 + 5, 50 + 10) = max(50, 60) = 60, but capped
      // min(50, 60) = 50
      expect(result?.text).toContain('50');
    });
  });
});

describe('detectDeloadRisk', () => {
  it('normal: όταν δεν υπάρχουν προειδοποιητικά σήματα', () => {
    const result = detectDeloadRisk({
      thisWeekVol: 1000,
      lastWeekVol: 1000,
      consecutiveDays: 3,
      avgRpe: 6,
    });

    expect(result.level).toBe('normal');
    expect(result.reasons).toHaveLength(0);
  });

  it('caution: +30% volume με high RPE', () => {
    const result = detectDeloadRisk({
      thisWeekVol: 1300, // +30%
      lastWeekVol: 1000,
      consecutiveDays: 3,
      avgRpe: 8,
    });

    expect(result.level).toBe('caution');
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain('Volume');
  });

  it('caution: 6+ consecutive days', () => {
    const result = detectDeloadRisk({
      thisWeekVol: 1000,
      lastWeekVol: 1000,
      consecutiveDays: 6,
      avgRpe: 6,
    });

    expect(result.level).toBe('caution');
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain('consecutive');
  });

  it('deload: both volume jump AND consecutive days', () => {
    const result = detectDeloadRisk({
      thisWeekVol: 1500, // +50% volume
      lastWeekVol: 1000,
      consecutiveDays: 7,
      avgRpe: 8.5,
    });

    expect(result.level).toBe('deload');
    expect(result.reasons).toHaveLength(2);
  });

  it('ignores volume jump όταν RPE < 8', () => {
    const result = detectDeloadRisk({
      thisWeekVol: 1400, // +40% volume
      lastWeekVol: 1000,
      consecutiveDays: 3,
      avgRpe: 7, // Below threshold
    });

    expect(result.level).toBe('normal');
    expect(result.reasons).toHaveLength(0);
  });

  it('ignores volume jump όταν lastWeekVol = 0 (no baseline)', () => {
    const result = detectDeloadRisk({
      thisWeekVol: 100,
      lastWeekVol: 0,
      consecutiveDays: 3,
      avgRpe: 8,
    });

    expect(result.level).toBe('normal');
    expect(result.reasons).toHaveLength(0);
  });
});

describe('planNextPeriod', () => {
  const basePlan: NextPeriodPlan = {
    activeExercises: ['pull-up', 'dip', 'push-up'],
    goals: [],
    skillProgress: new Map(),
    lastPerfByExercise: new Map(),
  };

  it('επιστρέφει empty array χωρίς data', () => {
    const result = planNextPeriod(basePlan);
    expect(result).toHaveLength(0);
  });

  describe('General progressions (no goals)', () => {
    it('προτείνει general moves για active exercises', () => {
      const perf: LastExercisePerformance = {
        id: '1',
        exercise_id: 'pull-up',
        exercise_name: 'Pull-up',
        max_reps_in_set: 8,
        target_reps: 10,
        top_weight_kg: 0,
        is_body_weight: true,
        completed_all_reps: false,
        is_hold_exercise: false,
      };

      const plan: NextPeriodPlan = {
        activeExercises: ['pull-up', 'dip'],
        goals: [],
        skillProgress: new Map(),
        lastPerfByExercise: new Map([['pull-up', perf]]),
      };

      const result = planNextPeriod(plan);
      expect(result).toHaveLength(1);
      expect(result[0]!.reason).toBe('general');
      expect(result[0]!.exerciseId).toBe('pull-up');
      expect(result[0]!.priority).toBe(10);
    });

    it('αγνοεί active exercises χωρίς ιστορικό', () => {
      const plan: NextPeriodPlan = {
        activeExercises: ['pull-up', 'unknown-exercise'],
        goals: [],
        skillProgress: new Map(),
        lastPerfByExercise: new Map(), // empty
      };

      const result = planNextPeriod(plan);
      expect(result).toHaveLength(0);
    });
  });

  describe('Goal-linked progressions', () => {
    it('goal με exercise → priority 0', () => {
      const perf: LastExercisePerformance = {
        id: '1',
        exercise_id: 'weighted-pull-up',
        exercise_name: 'Weighted Pull-up',
        max_reps_in_set: 5,
        target_reps: 5,
        top_weight_kg: 30,
        is_body_weight: false,
        completed_all_reps: true,
        is_hold_exercise: false,
      };

      const plan: NextPeriodPlan = {
        activeExercises: [],
        goals: [
          {
            id: 'g1',
            label: '50kg weighted pull-up',
            metric: 'weight',
            exercise_id: 'weighted-pull-up',
            target_weight_kg: 50,
          },
        ],
        skillProgress: new Map(),
        lastPerfByExercise: new Map([['weighted-pull-up', perf]]),
      };

      const result = planNextPeriod(plan);
      expect(result).toHaveLength(1);
      expect(result[0]!.reason).toBe('goal');
      expect(result[0]!.priority).toBe(0);
      expect(result[0]!.goalLabel).toBe('50kg weighted pull-up');
    });

    it('goal με skill → επόμενο skill step', () => {
      const plan: NextPeriodPlan = {
        activeExercises: [],
        goals: [
          {
            id: 'g1',
            label: 'Full Front Lever',
            metric: 'skill_mastery',
            skill_id: 'front-lever',
          },
        ],
        skillProgress: new Map([
          [
            'front-lever',
            {
              skill_name: 'Front Lever',
              current_step: 3,
              max_step: 5,
            },
          ],
        ]),
        lastPerfByExercise: new Map(),
      };

      const result = planNextPeriod(plan);
      expect(result).toHaveLength(1);
      expect(result[0]!.move).toContain('Step 4/5');
      expect(result[0]!.priority).toBe(0);
    });

    it('ignores goal χωρίς exercise_id ή skill_id', () => {
      const plan: NextPeriodPlan = {
        activeExercises: [],
        goals: [
          {
            id: 'g1',
            label: 'Custom tracker',
            metric: 'volume',
            // no exercise_id, no skill_id
          },
        ],
        skillProgress: new Map(),
        lastPerfByExercise: new Map(),
      };

      const result = planNextPeriod(plan);
      expect(result).toHaveLength(0);
    });

    it('ignores skill goal αν το current_step >= max_step', () => {
      const plan: NextPeriodPlan = {
        activeExercises: [],
        goals: [
          {
            id: 'g1',
            label: 'Full Front Lever',
            metric: 'skill_mastery',
            skill_id: 'front-lever',
          },
        ],
        skillProgress: new Map([
          [
            'front-lever',
            {
              skill_name: 'Front Lever',
              current_step: 5,
              max_step: 5, // Already at max
            },
          ],
        ]),
        lastPerfByExercise: new Map(),
      };

      const result = planNextPeriod(plan);
      expect(result).toHaveLength(0);
    });
  });

  describe('Priority ordering', () => {
    it('goal progressions (priority 0) πριν general (priority 10+)', () => {
      const perf1: LastExercisePerformance = {
        id: '1',
        exercise_id: 'goal-ex',
        exercise_name: 'Goal Exercise',
        max_reps_in_set: 5,
        target_reps: 5,
        top_weight_kg: 20,
        is_body_weight: false,
        completed_all_reps: true,
        is_hold_exercise: false,
      };

      const perf2: LastExercisePerformance = {
        id: '2',
        exercise_id: 'general-ex',
        exercise_name: 'General Exercise',
        max_reps_in_set: 8,
        target_reps: 10,
        top_weight_kg: 0,
        is_body_weight: true,
        completed_all_reps: false,
        is_hold_exercise: false,
      };

      const plan: NextPeriodPlan = {
        activeExercises: ['general-ex'],
        goals: [
          {
            id: 'g1',
            label: 'Goal target',
            metric: 'weight',
            exercise_id: 'goal-ex',
            target_weight_kg: 50,
          },
        ],
        skillProgress: new Map(),
        lastPerfByExercise: new Map([
          ['goal-ex', perf1],
          ['general-ex', perf2],
        ]),
      };

      const result = planNextPeriod(plan);
      expect(result).toHaveLength(2);
      expect(result[0]!.reason).toBe('goal');
      expect(result[1]!.reason).toBe('general');
    });

    it('goal-linked exercises δεν εμφανίζονται ξανά στο general section', () => {
      const perf: LastExercisePerformance = {
        id: '1',
        exercise_id: 'pull-up',
        exercise_name: 'Pull-up',
        max_reps_in_set: 10,
        target_reps: 10,
        top_weight_kg: 0,
        is_body_weight: true,
        completed_all_reps: true,
        is_hold_exercise: false,
      };

      const plan: NextPeriodPlan = {
        activeExercises: ['pull-up'], // Same exercise in active list
        goals: [
          {
            id: 'g1',
            label: 'Pull-up goal',
            metric: 'reps',
            exercise_id: 'pull-up',
          },
        ],
        skillProgress: new Map(),
        lastPerfByExercise: new Map([['pull-up', perf]]),
      };

      const result = planNextPeriod(plan);
      expect(result).toHaveLength(1); // Only appears once as goal
      expect(result[0]!.reason).toBe('goal');
    });
  });

  describe('Alphabetical ordering within priority level', () => {
    it('multiple moves σε ίδιο priority ταξινομούνται αλφαβητικά', () => {
      const perfZ: LastExercisePerformance = {
        id: '1',
        exercise_id: 'z-exercise',
        exercise_name: 'Zulu Exercise',
        max_reps_in_set: 5,
        target_reps: 5,
        top_weight_kg: 10,
        is_body_weight: false,
        completed_all_reps: true,
        is_hold_exercise: false,
      };

      const perfA: LastExercisePerformance = {
        id: '2',
        exercise_id: 'a-exercise',
        exercise_name: 'Alpha Exercise',
        max_reps_in_set: 8,
        target_reps: 10,
        top_weight_kg: 0,
        is_body_weight: true,
        completed_all_reps: false,
        is_hold_exercise: false,
      };

      const plan: NextPeriodPlan = {
        activeExercises: ['z-exercise', 'a-exercise'],
        goals: [],
        skillProgress: new Map(),
        lastPerfByExercise: new Map([
          ['z-exercise', perfZ],
          ['a-exercise', perfA],
        ]),
      };

      const result = planNextPeriod(plan);
      expect(result).toHaveLength(2);
      expect(result[0]!.exerciseName).toBe('Alpha Exercise');
      expect(result[1]!.exerciseName).toBe('Zulu Exercise');
    });
  });
});
