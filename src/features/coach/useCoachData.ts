/**
 * Coach mode data-assembly layer.
 *
 * Μαζεύει ΠΡΑΓΜΑΤΙΚΑ δεδομένα από τη βάση και τα δίνει στις καθαρές συναρτήσεις
 * του coach.ts (planNextPeriod / detectDeloadRisk). Reactive μέσω useLiveQuery.
 *
 * Αρχή: honest — αν δεν υπάρχει δεδομένο, δεν προτείνουμε τίποτα. Το double-
 * progression χρησιμοποιεί ένα default rep-ceiling (DEFAULT_REP_TARGET): κάτω από
 * αυτό → +1 rep, στο/πάνω → +βάρος. Είναι στάνταρ κανόνας (8–12 range), όχι
 * εφευρημένο νούμερο επίδοσης.
 *
 * Ο hook δεν κάνει καθόλου queries όταν το coach είναι OFF (enabled=false).
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { getVolumeTrend, getAllSkillProgress } from '@/lib/db/queries';
import { getAllGoalProgress } from '@/lib/db/goals';
import {
  buildLastPerformance,
  detectDeloadRisk,
  planNextPeriod,
  suggestNextForExercise,
  type DeloadRisk,
  type LastExercisePerformance,
  type NextExerciseMove,
  type NextMove,
  type NextPeriodPlan,
} from '@/lib/domain/coach';

/** Πόσο πίσω κοιτάμε για «ενεργές» ασκήσεις. */
const RECENT_DAYS = 21;

interface CoachData {
  moves: NextMove[];
  deloadRisk: DeloadRisk;
  /** Map exercise_id → επόμενη πρόταση, για το hint στο logging. */
  hintByExercise: Map<string, NextExerciseMove>;
  loading: boolean;
}

const EMPTY: CoachData = {
  moves: [],
  deloadRisk: { level: 'normal', reasons: [] },
  hintByExercise: new Map(),
  loading: false,
};

export function useCoachData(enabled: boolean): CoachData {
  const data = useLiveQuery(
    async (): Promise<Omit<CoachData, 'loading'> | null> => {
      if (!enabled) return null;

      const cutoff = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();
      const recentSets = await db.sets
        .filter((s) => s.deleted_at == null && !s.is_warmup && s.created_at >= cutoff)
        .toArray();
      const exercises = await db.exercises.toArray();
      const exById = new Map(exercises.map((e) => [e.id, e]));

      // Τελευταίο σετ ανά άσκηση (πιο πρόσφατο).
      const lastByEx = new Map<string, (typeof recentSets)[number]>();
      for (const s of recentSets) {
        const cur = lastByEx.get(s.exercise_id);
        if (!cur || s.created_at > cur.created_at) lastByEx.set(s.exercise_id, s);
      }

      const lastPerfByExercise = new Map<string, LastExercisePerformance>();
      for (const [exId, s] of lastByEx) {
        const ex = exById.get(exId);
        if (!ex) continue;
        lastPerfByExercise.set(
          exId,
          buildLastPerformance({
            id: s.id,
            exerciseId: exId,
            exerciseName: ex.name,
            isBodyweight: ex.is_bodyweight,
            isHold: ex.default_unit === 'sec',
            reps: s.reps,
            weightKg: s.weight_kg,
            holdSeconds: s.hold_seconds,
          }),
        );
      }

      const activeExercises = [...lastByEx.keys()];

      // Goals με σύνδεση σε άσκηση/skill (τα άλλα δεν παράγουν move).
      const goalProg = await getAllGoalProgress();
      const goals: NextPeriodPlan['goals'] = goalProg.map((gp) => ({
        id: gp.goal.id,
        label:
          gp.goal.label ||
          (gp.goal.exercise_id ? exById.get(gp.goal.exercise_id)?.name : undefined) ||
          'Goal',
        metric: gp.goal.skill_id
          ? 'skill_mastery'
          : gp.goal.metric === 'top_weight'
            ? 'weight'
            : 'reps',
        exercise_id: gp.goal.exercise_id ?? undefined,
        skill_id: gp.goal.skill_id ?? undefined,
      }));

      // Skill progress → {skill_name, current_step, max_step}.
      const skillProgRaw = await getAllSkillProgress();
      const skills = await db.skills.toArray();
      const skillById = new Map(skills.map((sk) => [sk.id, sk]));
      const skillProgress = new Map<
        string,
        { skill_name: string; current_step: number; max_step: number }
      >();
      for (const [skillId, prog] of skillProgRaw) {
        const steps = await db.skill_steps
          .where('skill_id')
          .equals(skillId)
          .sortBy('step_number');
        const maxStep = steps.length;
        const currentStep = prog.current_step_id
          ? steps.findIndex((st) => st.id === prog.current_step_id) + 1
          : 0;
        skillProgress.set(skillId, {
          skill_name: skillById.get(skillId)?.name ?? 'Skill',
          current_step: currentStep,
          max_step: maxStep,
        });
      }

      const moves = planNextPeriod({
        activeExercises,
        goals,
        skillProgress,
        lastPerfByExercise,
      });

      // Hint ανά άσκηση (για το logging).
      const hintByExercise = new Map<string, NextExerciseMove>();
      for (const [exId, perf] of lastPerfByExercise) {
        const hint = suggestNextForExercise(perf);
        if (hint) hintByExercise.set(exId, hint);
      }

      // Deload risk από volume + συνεχόμενες μέρες + μέσο RPE.
      const vol = await getVolumeTrend(14);
      const thisWeekVol = vol.slice(0, 7).reduce((a, d) => a + d.volume, 0);
      const lastWeekVol = vol.slice(7, 14).reduce((a, d) => a + d.volume, 0);
      let consecutiveDays = 0;
      for (const d of vol.slice(0, 7)) {
        if (d.volume > 0) consecutiveDays++;
        else break;
      }
      const rpes = recentSets.map((s) => s.rpe).filter((r): r is number => r != null);
      const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : 0;
      const deloadRisk = detectDeloadRisk({ thisWeekVol, lastWeekVol, consecutiveDays, avgRpe });

      return { moves, deloadRisk, hintByExercise };
    },
    [enabled],
    undefined,
  );

  if (data === undefined) {
    return { ...EMPTY, loading: enabled };
  }
  if (data === null) return EMPTY;
  return { ...data, loading: false };
}
