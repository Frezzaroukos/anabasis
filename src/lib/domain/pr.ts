/**
 * PR detection helpers — pure, given a candidate set + history.
 *
 * Note: callers materialize the result into the personal_records table.
 * This module just decides "is the candidate a new record?".
 */

import type { PersonalRecord, PRType, SetEntry, Workout } from '../db/types';
import { epley } from './e1rm';
import { repEquivalentScore } from './repEquivalent';
import { setVolume } from './volume';

/** PR types σε κιλά (kg storage) — μετατρέπονται σε lb στο UI· τα υπόλοιπα όχι. */
export const WEIGHT_PR_TYPES: ReadonlySet<PRType> = new Set<PRType>([
  'max_weight',
  'max_volume',
  'session_volume',
  'e1rm',
  'max_total_load',
  'e1rm_total',
]);

/**
 * Τύποι που ξεκίνησαν να καταγράφονται αργότερα (backfill στο boot). Γιορτάζονται
 * μόνο όταν ξεπερνούν ΥΠΑΡΧΟΝ ρεκόρ ίδιου τύπου — αλλιώς το πρώτο σετ μετά το
 * update σε κάθε BW άσκηση θα έριχνε ψεύτικο κομφετί πριν τρέξει το backfill.
 */
export const LATE_PR_TYPES: ReadonlySet<PRType> = new Set<PRType>([
  'max_total_load',
  'e1rm_total',
  'relative_strength',
  'rep_equivalent',
]);

/**
 * Ρεκόρ ΣΥΝΕΔΡΙΑΣ ανά άσκηση (σύνολο μιας προπόνησης, όχι ενός σετ): περισσότερα
 * σετ / reps / όγκος / δευτερόλεπτα hold στην ίδια άσκηση. set_id = null.
 */
export const SESSION_PR_TYPES: ReadonlySet<PRType> = new Set<PRType>([
  'session_sets',
  'session_reps',
  'session_volume',
  'session_hold',
]);

/** Δεν μετράνε XP/badges: παράγωγα/δεύτερη ματιά — αλλιώς το backfill φουσκώνει το επίπεδο. */
export const NON_XP_PR_TYPES: ReadonlySet<PRType> = new Set<PRType>([
  ...SESSION_PR_TYPES,
  'relative_strength',
  // δεύτερη ματιά στο ίδιο σετ (το max_reps/max_weight δίνει ήδη XP) — και το
  // backfill τους από το ιστορικό δεν πρέπει να ανεβάσει το επίπεδο
  'rep_equivalent',
  'reps_at_load',
]);

/**
 * Τύποι που γράφονται ΜΟΝΟ όταν ξεπερνούν προηγούμενη προπόνηση — χωρίς
 * baseline rows. Ο `realPRs` τους μετρά πάντα (η σύγκριση έγινε ήδη στα σετ).
 */
export const IMPROVEMENT_ONLY_PR_TYPES: ReadonlySet<PRType> = new Set<PRType>(['reps_at_load']);

/**
 * Ελάχιστη σχετική βελτίωση για να μετρήσει νέο ρεκόρ ανά τύπο. Η σχετική
 * δύναμη (e1RM συνολικού φορτίου ÷ σωματικό βάρος) κινείται με κάθε διακύμανση
 * της ζυγαριάς — χωρίς κατώφλι 1% θα έβγαζε «ρεκόρ» για 300 g διαφορά.
 */
const MIN_GAIN: Partial<Record<string, number>> = { relative_strength: 0.01 };

export interface PRCandidate {
  type: PRType;
  value: number;
  reps: number | null;
  weight_kg: number | null;
  /** σωματικό βάρος του σετ (μόνο στους τύπους συνολικού φορτίου) */
  bodyweight_kg?: number | null;
  /** true = το σωματικό βάρος είναι κατά προσέγγιση (μεταγενέστερη μέτρηση) */
  bw_estimated?: boolean;
  /** «καλύτερο» σημαίνει μεγαλύτερο (βάρος) ή μικρότερο (ρυθμός) — default 'higher' */
  direction?: 'higher' | 'lower';
}

export interface SetCandidateOptions {
  /** το set.bodyweight_kg προέρχεται από μεταγενέστερη μέτρηση (κατά προσέγγιση) */
  bwEstimated?: boolean;
  /** άσκηση σωματικού βάρους (`exercise.is_bodyweight`) → και ρεκόρ reps-ισοδύναμου */
  bodyweightExercise?: boolean;
}

export function candidatesFromSet(set: SetEntry, opts: SetCandidateOptions = {}): PRCandidate[] {
  const candidates: PRCandidate[] = [];

  // Reps + volume: ALWAYS track if reps > 0, regardless of weight_kg.
  // Pure bodyweight reps and volume are valid PRs.
  if (set.reps != null && set.reps > 0) {
    candidates.push({
      type: 'max_reps',
      value: set.reps,
      reps: set.reps,
      weight_kg: set.weight_kg,
    });
    candidates.push({
      type: 'max_volume',
      value: setVolume(set),
      reps: set.reps,
      weight_kg: set.weight_kg,
    });
  }

  // Weight + e1RM: ONLY for weighted sets (added load).
  // Pure bodyweight gets no max_weight/e1rm (they'd be 0/misleading).
  if (set.weight_kg != null && set.weight_kg > 0 && set.reps != null && set.reps > 0) {
    candidates.push({
      type: 'max_weight',
      value: set.weight_kg,
      reps: set.reps,
      weight_kg: set.weight_kg,
    });
    candidates.push({
      type: 'e1rm',
      value: epley(set.weight_kg, set.reps),
      reps: set.reps,
      weight_kg: set.weight_kg,
    });
  }

  // Συνολικό φορτίο (σώμα + πρόσθετο): μόνο όταν ξέρουμε το σωματικό βάρος του
  // σετ. Έτσι ένα σκέτο BW σετ (χωρίς βάρη) μπορεί να σπάσει ρεκόρ φορτίου/e1RM,
  // και το weighted μετρά με το πραγματικό του φορτίο.
  if (set.bodyweight_kg != null && set.bodyweight_kg > 0 && set.reps != null && set.reps > 0) {
    const total = set.bodyweight_kg + (set.weight_kg ?? 0);
    const est = opts.bwEstimated ? { bw_estimated: true } : {};
    candidates.push({
      type: 'max_total_load',
      value: total,
      reps: set.reps,
      weight_kg: set.weight_kg,
      bodyweight_kg: set.bodyweight_kg,
      ...est,
    });
    const e1rmTotal = epley(total, set.reps);
    candidates.push({
      type: 'e1rm_total',
      value: e1rmTotal,
      reps: set.reps,
      weight_kg: set.weight_kg,
      bodyweight_kg: set.bodyweight_kg,
      ...est,
    });
    // Σχετική δύναμη: λιγότερο σωματικό βάρος με ίδια απόδοση ανεβάζει τον λόγο
    // (δεν σπάει το συνολικό φορτίο). ΠΟΤΕ από κατά προσέγγιση βάρος — θα ήταν
    // ρεκόρ πάνω σε εκτίμηση.
    if (!opts.bwEstimated) {
      candidates.push({
        type: 'relative_strength',
        value: Math.round((e1rmTotal / set.bodyweight_kg) * 1000) / 1000,
        reps: set.reps,
        weight_kg: set.weight_kg,
        bodyweight_kg: set.bodyweight_kg,
      });
    }
  }

  // Reps-ισοδύναμο (κανόνας χρήστη, βλ. domain/repEquivalent): μόνο σε ασκήσεις
  // σώματος, ώστε 40 kg × 1 και 30 kg × 3 να συγκρίνονται. Σκορ, όχι βάρος.
  if (opts.bodyweightExercise && set.reps != null && set.reps > 0) {
    candidates.push({
      type: 'rep_equivalent',
      value: repEquivalentScore(set.reps, set.weight_kg),
      reps: set.reps,
      weight_kg: set.weight_kg,
    });
  }

  if (set.hold_seconds != null && set.hold_seconds > 0) {
    candidates.push({
      type: 'max_hold',
      value: set.hold_seconds,
      reps: null,
      weight_kg: set.weight_kg,
    });
  }

  return candidates;
}

/**
 * PR candidates για δραστηριότητες χωρίς σετ (τρέξιμο/ποδήλατο/κολύμβηση).
 * Ο ρυθμός (πιο αργός = χειρότερος) είναι η μόνη μετρική με 'lower' direction
 * σε όλο το PR σύστημα — γι' αυτό υπάρχει το πεδίο `direction`.
 */
export function candidatesFromWorkout(
  w: Pick<Workout, 'distance_km' | 'duration_seconds'>,
): PRCandidate[] {
  const candidates: PRCandidate[] = [];

  if (w.distance_km != null && w.distance_km > 0) {
    candidates.push({
      type: 'longest_distance',
      value: w.distance_km,
      reps: null,
      weight_kg: null,
    });
    if (w.duration_seconds != null && w.duration_seconds > 0) {
      candidates.push({
        type: 'fastest_pace',
        value: w.duration_seconds / w.distance_km,
        reps: null,
        weight_kg: null,
        direction: 'lower',
      });
    }
  } else if (w.duration_seconds != null && w.duration_seconds > 0) {
    // διάρκεια χωρίς απόσταση (π.χ. κολύμβηση χωρίς GPS) — ακόμα αξίζει PR
    candidates.push({
      type: 'longest_duration',
      value: w.duration_seconds,
      reps: null,
      weight_kg: null,
    });
  }

  return candidates;
}

export function isNewPR(
  candidate: PRCandidate,
  current: Pick<PersonalRecord, 'type' | 'value'> | null,
): boolean {
  if (!current) return true;
  if (current.type !== candidate.type) return true;
  if (candidate.direction === 'lower') return candidate.value < current.value;
  const gain = MIN_GAIN[candidate.type] ?? 0;
  return candidate.value > current.value * (1 + gain);
}

/** Σύνολο μιας άσκησης σε μία προπόνηση → υποψήφια session ρεκόρ. */
export interface SessionTotals {
  sets: number;
  reps: number;
  volume: number;
  holdSeconds: number;
  /** κάποιο σετ χρησιμοποίησε κατά προσέγγιση σωματικό βάρος στον όγκο */
  bwEstimated: boolean;
}

export function sessionTotals(
  sets: ReadonlyArray<SetEntry>,
  estimatedSetIds: ReadonlySet<string> = new Set(),
): SessionTotals {
  const totals: SessionTotals = { sets: 0, reps: 0, volume: 0, holdSeconds: 0, bwEstimated: false };
  for (const s of sets) {
    const reps = (s.reps ?? 0) + (s.rest_pause_reps ?? []).reduce((a, b) => a + b, 0);
    const hold = s.hold_seconds ?? 0;
    // «σετ εργασίας» μετρά μόνο αν έγινε κάτι (reps ή hold) — όχι κενό σετ
    if (reps <= 0 && hold <= 0) continue;
    totals.sets += 1;
    totals.reps += reps;
    totals.holdSeconds += hold;
    totals.volume += setVolume(s);
    if (estimatedSetIds.has(s.id) && reps > 0) totals.bwEstimated = true;
  }
  totals.volume = Math.round(totals.volume * 100) / 100;
  return totals;
}

export function sessionCandidates(t: SessionTotals): PRCandidate[] {
  const out: PRCandidate[] = [];
  const base = { reps: null, weight_kg: null } as const;
  if (t.sets > 0) out.push({ type: 'session_sets', value: t.sets, ...base });
  if (t.reps > 0) out.push({ type: 'session_reps', value: t.reps, ...base });
  if (t.volume > 0) {
    out.push({
      type: 'session_volume',
      value: t.volume,
      ...base,
      ...(t.bwEstimated ? { bw_estimated: true } : {}),
    });
  }
  if (t.holdSeconds > 0) out.push({ type: 'session_hold', value: t.holdSeconds, ...base });
  return out;
}

/**
 * Το πρόσθετο φορτίο ενός σετ ως κλειδί σύγκρισης: σκέτο σώμα (null/0) = 0,
 * αλλιώς kg στα 2 δεκαδικά (ίδια τιμή lb → ίδια kg, άρα ίδιο κλειδί).
 */
export function loadKey(weightKg: number | null | undefined): number {
  if (weightKg == null || !Number.isFinite(weightKg) || weightKg <= 0) return 0;
  return Math.round(weightKg * 100) / 100;
}

type RepsSet = Pick<SetEntry, 'workout_id' | 'weight_kg' | 'reps'>;

/**
 * «Περισσότερες reps με το ΙΔΙΟ φορτίο» (π.χ. +10 kg × 6 → × 8, ή 20 → 30
 * σκέτες έλξεις) — το `max_reps` το πιάνει μόνο όταν ξεπερνά το ΣΥΝΟΛΙΚΟ ρεκόρ
 * reps της άσκησης, οπότε +10 kg × 8 μετά από 20 σκέτες δεν μετρούσε ποτέ.
 *
 * Τροφοδοτείς τα working σετ μιας άσκησης με χρονολογική σειρά· το `consider`
 * επιστρέφει candidate ΜΟΝΟ όταν:
 *  - υπάρχει σετ στο ίδιο φορτίο από ΠΡΟΗΓΟΥΜΕΝΗ προπόνηση (αλλιώς δεν
 *    ξεπέρασες τίποτα — ένα νέο φορτίο δεν είναι ρεκόρ reps),
 *  - οι reps είναι ΑΥΣΤΗΡΑ περισσότερες από το καλύτερο σε αυτό το φορτίο
 *    (ισοπαλία ≠ ρεκόρ),
 *  - δεν σπάει ήδη το συνολικό max_reps (αλλιώς το ίδιο σετ θα έβγαζε δύο PR).
 *
 * Ίδια λογική για το live (addSet) και το recompute — ίδια rows, ίδια ids.
 */
export class RepsAtLoadTracker {
  private overallBest = 0;
  private readonly byLoad = new Map<number, { best: number; firstWorkoutId: string }>();

  consider(set: RepsSet): PRCandidate | null {
    const reps = set.reps ?? 0;
    if (reps <= 0) return null;
    const key = loadKey(set.weight_kg);
    const seen = this.byLoad.get(key);
    const isRecord =
      seen != null &&
      seen.firstWorkoutId !== set.workout_id &&
      reps > seen.best &&
      reps <= this.overallBest;
    if (seen) seen.best = Math.max(seen.best, reps);
    else this.byLoad.set(key, { best: reps, firstWorkoutId: set.workout_id });
    this.overallBest = Math.max(this.overallBest, reps);
    return isRecord
      ? { type: 'reps_at_load', value: reps, reps, weight_kg: set.weight_kg }
      : null;
  }
}
