/**
 * Coach mode — pure domain logic for progression suggestions & deload detection.
 *
 * ΟΧΙ DB import — accept plain data, return suggestions. Unit-testable.
 * Αρχή: honest signals, no invented data.
 */

/* ─────────── Input/Output types ─────────── */

/**
 * Τελευταία επίδοση άσκησης (ιστορικό).
 * Δεδομένα από getLastPerformance(exerciseId).
 */
export interface LastExercisePerformance {
  id: string;
  exercise_id: string;
  exercise_name: string;
  max_reps_in_set: number;
  target_reps: number;
  top_weight_kg: number;
  is_body_weight: boolean;
  completed_all_reps: boolean;
  is_hold_exercise: boolean;
  max_hold_seconds?: number;
  target_hold_seconds?: number;
}

/**
 * Πρόταση προόδου για άσκηση.
 */
export interface NextExerciseMove {
  kind: 'add_weight' | 'add_rep' | 'add_hold';
  text: string;
}

/**
 * Ανίχνευση κινδύνου περιόδου «ξεφόρτωσης» (deload).
 */
export interface DeloadRisk {
  level: 'normal' | 'caution' | 'deload';
  reasons: string[];
}

/**
 * Παράμετροι σχεδιασμού επόμενης περιόδου.
 */
export interface NextPeriodPlan {
  activeExercises: string[];
  goals: Array<{
    id: string;
    label: string;
    metric: 'volume' | 'sets' | 'reps' | 'distance' | 'duration' | 'skill_mastery' | 'weight';
    exercise_id?: string;
    skill_id?: string;
    target_weight_kg?: number;
  }>;
  skillProgress: Map<string, { skill_name: string; current_step: number; max_step: number }>;
  lastPerfByExercise: Map<string, LastExercisePerformance>;
}

/**
 * Στοιχείο του «Next Moves» πίνακα (smart suggestions).
 */
export interface NextMove {
  exerciseId: string;
  exerciseName: string;
  reason: 'goal' | 'general';
  goalLabel?: string;
  move: string;
  priority: number;
}

/* ─────────── Pure functions ─────────── */

/**
 * suggestNextForExercise — διπλή προόδου κανόνα.
 *
 * Αν το τελευταίο session έπιασε το ανώτερο όριο (max_reps_in_set >= target_reps
 * σε όλα τα σετ) → πρότεινε +βάρος (μικρό increment).
 * Αλλιώς → πρότεινε +1 rep.
 * Για hold-based → +χρόνο (2–5s).
 *
 * Επιστρέφει null αν δεν υπάρχει ιστορικό (no invented data).
 */
export function suggestNextForExercise(last: LastExercisePerformance | null): NextExerciseMove | null {
  if (!last) return null;

  // Hold exercises: +time
  if (last.is_hold_exercise) {
    if (!last.max_hold_seconds || !last.target_hold_seconds) return null;

    const nextHold = Math.min(last.max_hold_seconds + 5, last.target_hold_seconds + 10);
    return {
      kind: 'add_hold',
      text: `Hold +${Math.ceil(nextHold - last.max_hold_seconds)}s → ${nextHold}s target`,
    };
  }

  // Regular exercises with reps
  if (!last.completed_all_reps) {
    // Didn't hit target reps — add 1 rep
    return {
      kind: 'add_rep',
      text: `${last.max_reps_in_set + 1} reps (one more set)`,
    };
  }

  // Hit target reps — add weight
  const increment = last.is_body_weight ? 1 : 2.5; // kg
  const nextWeight = last.top_weight_kg + increment;

  return {
    kind: 'add_weight',
    text: `${nextWeight.toFixed(1)} kg (+${increment} kg)`,
  };
}

/**
 * detectDeloadRisk — ανίχνευση περιόδου υπερπροπόνησης.
 *
 * Κανόνες:
 * - Volume +>30% vs προηγ. εβδομάδα AND avgRpe ≥8 → caution
 * - ≥6 συνεχόμενες μέρες προπόνησης → caution
 * - Και τα δύο → deload
 * - Αλλιώς → normal
 */
export function detectDeloadRisk(params: {
  thisWeekVol: number;
  lastWeekVol: number;
  consecutiveDays: number;
  avgRpe: number;
}): DeloadRisk {
  const { thisWeekVol, lastWeekVol, consecutiveDays, avgRpe } = params;

  const reasons: string[] = [];

  // Check volume jump
  const volumeIncrease = lastWeekVol > 0 ? (thisWeekVol - lastWeekVol) / lastWeekVol : 0;
  const volumeWarning = volumeIncrease >= 0.3 && avgRpe >= 8;

  if (volumeWarning) {
    reasons.push(`Volume +${Math.round(volumeIncrease * 100)}% & high RPE (avg ${avgRpe})`);
  }

  // Check consecutive days
  const consecutiveWarning = consecutiveDays >= 6;
  if (consecutiveWarning) {
    reasons.push(`${consecutiveDays} consecutive training days`);
  }

  // Determine level
  let level: 'normal' | 'caution' | 'deload' = 'normal';
  if (volumeWarning && consecutiveWarning) {
    level = 'deload';
  } else if (volumeWarning || consecutiveWarning) {
    level = 'caution';
  }

  return { level, reasons };
}

/**
 * planNextPeriod — σχεδιασμός επόμενης περιόδου.
 *
 * Δημιουργεί έναν πίνακα από NextMove suggestions:
 * - Για κάθε goal (target exercise/skill/weight): concrete next progression step.
 * - Για κάθε active exercise χωρίς goal: general next move από τελευταία επίδοση.
 * - Ταξινόμηση: goal-linked πρώτα (priority 0), μετά general (priority 10+).
 *
 * Αρχή: honest — αν δεν υπάρχει δεδομένο, ΔΕΝ μαντεύουμε.
 */
export function planNextPeriod(plan: NextPeriodPlan): NextMove[] {
  const moves: NextMove[] = [];
  const seenExercises = new Set<string>();

  // 1. Goal-linked progressions (priority 0)
  for (const goal of plan.goals) {
    if (!goal.exercise_id && !goal.skill_id) continue;

    if (goal.exercise_id) {
      seenExercises.add(goal.exercise_id);
      const perf = plan.lastPerfByExercise.get(goal.exercise_id);
      const nextMove = suggestNextForExercise(perf || null);

      if (nextMove) {
        moves.push({
          exerciseId: goal.exercise_id,
          exerciseName: perf?.exercise_name || 'Unknown',
          reason: 'goal',
          goalLabel: goal.label,
          move: nextMove.text,
          priority: 0,
        });
      }
    }

    if (goal.skill_id) {
      const skillProg = plan.skillProgress.get(goal.skill_id);
      if (skillProg) {
        const nextStep = skillProg.current_step + 1;
        if (nextStep <= skillProg.max_step) {
          moves.push({
            exerciseId: goal.skill_id,
            exerciseName: skillProg.skill_name,
            reason: 'goal',
            goalLabel: goal.label,
            move: `Step ${nextStep}/${skillProg.max_step}`,
            priority: 0,
          });
        }
      }
    }
  }

  // 2. General progressions for active exercises (priority 10+)
  for (const exId of plan.activeExercises) {
    if (seenExercises.has(exId)) continue;

    const perf = plan.lastPerfByExercise.get(exId);
    const nextMove = suggestNextForExercise(perf || null);

    if (nextMove) {
      moves.push({
        exerciseId: exId,
        exerciseName: perf?.exercise_name || 'Unknown',
        reason: 'general',
        move: nextMove.text,
        priority: 10,
      });
    }
  }

  // 3. Sort: goal-linked first (priority 0), then general (priority 10+)
  moves.sort((a, b) => a.priority - b.priority || a.exerciseName.localeCompare(b.exerciseName));

  return moves;
}
