/**
 * Ξαναϋπολογισμός PR για ΟΛΕΣ τις ασκήσεις σωματικού βάρους που έχουν σετ.
 * Τρέχει όταν αλλάζει το σωματικό βάρος (saveBodyMetric / import), γιατί τα
 * ρεκόρ συνολικού φορτίου (`max_total_load` / `e1rm_total`) εξαρτώνται από αυτό.
 * Ξεχωριστό αρχείο (όχι queries.ts) λόγω του parse ορίου εκεί.
 */
import { db } from './schema';
import { getCurrentUserId } from './session';
import { recomputePRsForExercise } from './queries';

export async function recomputeBodyweightExercisePRs(): Promise<number> {
  const uid = getCurrentUserId();
  const bwIds = (await db.exercises.toArray()).filter((e) => e.is_bodyweight).map((e) => e.id);
  if (bwIds.length === 0) return 0;
  const used = new Set(
    (await db.sets.where('exercise_id').anyOf(bwIds).toArray())
      .filter((s) => s.deleted_at == null)
      .map((s) => s.exercise_id),
  );
  let n = 0;
  for (const id of used) {
    // Αλλαγή προφίλ στη μέση = μην γράψεις στο λάθος προφίλ.
    if (getCurrentUserId() !== uid) return n;
    await recomputePRsForExercise(id);
    n += 1;
  }
  return n;
}
