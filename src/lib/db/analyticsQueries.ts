/**
 * DB layer για τα analytics charts της Προόδου.
 *
 * Ξεχωριστό αρχείο από το `queries.ts` (όριο oxc parser) — αλλά ίδια αρχή:
 * κανένα component δεν αγγίζει `db.*` απευθείας. Η μαθηματική λογική μένει
 * στο `./analytics.ts` (pure), εδώ γίνεται μόνο το join workouts↔sets και το
 * φιλτράρισμα στο επιλεγμένο εύρος.
 */

import { db } from './schema';
import { getCurrentUserId } from './session';
import { localDay } from './queries';
import {
  buildCategoryDistribution,
  buildPRTimeline,
  buildTrainingHeatmap,
  buildWeeklyCategorySets,
  buildWeeklyFrequency,
  buildWeeklyVolume,
  weekStarts,
  type AnalyticsSetRow,
  type CategorySlice,
  type HeatmapDay,
  type WeeklyCategoryPoint,
  type PRTimelinePoint,
  type WeeklyFrequencyPoint,
  type WeeklyVolumePoint,
} from './analytics';

/** Τοπική ημέρα `days` ημέρες πίσω (συμπεριλαμβανομένης της σημερινής). */
function localDayDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.max(0, days - 1));
  return localDay(d);
}

async function loadSetRows(workouts: { id: string; started_at: string }[]): Promise<AnalyticsSetRow[]> {
  if (workouts.length === 0) return [];
  const dayById = new Map(
    workouts.map((w) => [w.id, localDay(new Date(w.started_at))]),
  );
  const sets = await db.sets
    .where('workout_id')
    .anyOf([...dayById.keys()])
    .toArray();
  return sets
    .filter((s) => s.deleted_at == null)
    .map((s) => ({
      exerciseId: s.exercise_id,
      workoutId: s.workout_id,
      date: dayById.get(s.workout_id)!,
      weightKg: s.weight_kg,
      bodyweightKg: s.bodyweight_kg,
      reps: s.reps,
      restPauseReps: s.rest_pause_reps,
      isWarmup: s.is_warmup,
      setType: s.set_type,
    }));
}

/**
 * Εβδομαδιαίος όγκος (kg). Περιλαμβάνει και σετ από προπόνηση σε εξέλιξη —
 * ό,τι έχει ήδη καταγραφεί είναι πραγματικό φορτίο, ίδιο με το getVolumeTrend.
 */
export async function getWeeklyVolumeSeries(weeks: number): Promise<WeeklyVolumePoint[]> {
  const since = weekStarts(weeks)[0]!;
  const workouts = (
    await db.workouts.where('user_id').equals(getCurrentUserId()).toArray()
  ).filter((w) => w.deleted_at == null && localDay(new Date(w.started_at)) >= since);
  const rows = await loadSetRows(workouts);
  return buildWeeklyVolume(rows, weeks);
}

/** Προπονήσεις ανά εβδομάδα — μόνο ολοκληρωμένες (ended_at), όλων των ειδών. */
export async function getWeeklyFrequencySeries(
  weeks: number,
): Promise<WeeklyFrequencyPoint[]> {
  const since = weekStarts(weeks)[0]!;
  const workouts = (
    await db.workouts.where('user_id').equals(getCurrentUserId()).toArray()
  )
    .filter(
      (w) =>
        w.deleted_at == null &&
        w.ended_at != null &&
        localDay(new Date(w.started_at)) >= since,
    )
    .map((w) => ({ id: w.id, date: localDay(new Date(w.started_at)) }));
  return buildWeeklyFrequency(workouts, weeks);
}

/** Κατανομή working σετ ανά κατηγορία άσκησης στο εύρος ημερών. */
export async function getCategoryDistribution(days: number): Promise<CategorySlice[]> {
  const since = localDayDaysAgo(days);
  const [workouts, exercises] = await Promise.all([
    db.workouts.where('user_id').equals(getCurrentUserId()).toArray(),
    db.exercises.toArray(),
  ]);
  const inRange = workouts.filter(
    (w) => w.deleted_at == null && localDay(new Date(w.started_at)) >= since,
  );
  const rows = await loadSetRows(inRange);
  return buildCategoryDistribution(
    rows,
    exercises.map((e) => ({ id: e.id, category: e.category })),
  );
}

/** Σωρευτικά PR στο εύρος ημερών, με όνομα άσκησης/δραστηριότητας για tooltip. */
export async function getPRTimeline(days: number): Promise<PRTimelinePoint[]> {
  const since = localDayDaysAgo(days);
  const [prs, exercises, activities] = await Promise.all([
    db.personal_records.where('user_id').equals(getCurrentUserId()).toArray(),
    db.exercises.toArray(),
    db.activities.toArray(),
  ]);
  const exerciseName = new Map(exercises.map((e) => [e.id, e.name]));
  const activityLabel = new Map(activities.map((a) => [a.key, a.label]));

  const events = prs
    // Tombstoned PRs (recompute μετά από edit/διαγραφή σετ) δεν είναι ρεκόρ.
    .filter((pr) => pr.deleted_at == null)
    .map((pr) => ({
      date: localDay(new Date(pr.achieved_at)),
      type: pr.type,
      name: pr.exercise_id
        ? (exerciseName.get(pr.exercise_id) ?? '')
        : pr.activity_kind
          ? (activityLabel.get(pr.activity_kind) ?? pr.activity_kind)
          : '',
    }))
    .filter((e) => e.date >= since);

  return buildPRTimeline(events);
}

/** Εβδομαδιαία working σετ ανά κατηγορία (stacked). */
export async function getWeeklyCategorySets(weeks: number): Promise<WeeklyCategoryPoint[]> {
  const since = weekStarts(weeks)[0]!;
  const [workouts, exercises] = await Promise.all([
    db.workouts.where('user_id').equals(getCurrentUserId()).toArray(),
    db.exercises.toArray(),
  ]);
  const inRange = workouts.filter(
    (w) => w.deleted_at == null && localDay(new Date(w.started_at)) >= since,
  );
  const rows = await loadSetRows(inRange);
  return buildWeeklyCategorySets(
    rows,
    exercises.map((e) => ({ id: e.id, category: e.category })),
    weeks,
  );
}

/** Ημέρες προπόνησης (ολοκληρωμένες) για το consistency heatmap. */
export async function getTrainingHeatmap(weeks: number): Promise<HeatmapDay[]> {
  const since = weekStarts(weeks)[0]!;
  const workouts = (await db.workouts.where('user_id').equals(getCurrentUserId()).toArray())
    .filter(
      (w) =>
        w.deleted_at == null &&
        w.ended_at != null &&
        localDay(new Date(w.started_at)) >= since,
    )
    .map((w) => ({ id: w.id, date: localDay(new Date(w.started_at)) }));
  return buildTrainingHeatmap(workouts, weeks);
}

/**
 * Βήματα skills (rungs) που πέτυχες στο εύρος ημερών — σωρευτικά ανά ημέρα.
 * `type` = όνομα skill, `name` = όνομα βήματος (για tooltip). Διαγραμμένες
 * ολοκληρώσεις και βήματα/skills που έχουν σβηστεί δεν μετράνε.
 */
export async function getSkillStepTimeline(days: number): Promise<PRTimelinePoint[]> {
  const since = localDayDaysAgo(days);
  const [completions, steps, skills] = await Promise.all([
    db.user_skill_step_completions.where('user_id').equals(getCurrentUserId()).toArray(),
    db.skill_steps.toArray(),
    db.skills.toArray(),
  ]);
  const stepById = new Map(steps.map((st) => [st.id, st]));
  const skillById = new Map(skills.filter((sk) => sk.deleted_at == null).map((sk) => [sk.id, sk]));
  const events = completions
    .filter((c) => c.deleted_at == null)
    .flatMap((c) => {
      const step = stepById.get(c.skill_step_id);
      const skill = step ? skillById.get(step.skill_id) : undefined;
      if (!step || !skill) return [];
      return [{ date: localDay(new Date(c.achieved_at)), type: skill.name, name: step.name }];
    })
    .filter((e) => e.date >= since);
  return buildPRTimeline(events);
}

/** Σωματικό βάρος (kg) ανά ημέρα στο εύρος — μόνο ζωντανές μετρήσεις με τιμή. */
export async function getBodyWeightSeries(days: number): Promise<{ date: string; value: number }[]> {
  const since = localDayDaysAgo(days);
  const rows = await db.body_metrics.where('user_id').equals(getCurrentUserId()).toArray();
  return rows
    .filter((r) => r.deleted_at == null && r.weight_kg != null && r.date >= since)
    .map((r) => ({ date: r.date, value: r.weight_kg as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
