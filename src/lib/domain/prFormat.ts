import type { PersonalRecord, WeightUnit } from '../db/types';
import { WEIGHT_PR_TYPES } from './pr';
import { formatWeight, toDisplayWeight } from '../units';

/** Η τιμή ενός PR όπως φαίνεται (μονάδες βάρους, δευτερόλεπτα, ×BW…). Ένα σημείο για όλες τις λίστες. */
export function formatPRValue(
  pr: Pick<PersonalRecord, 'type' | 'value'> & Partial<Pick<PersonalRecord, 'weight_kg'>>,
  unit: WeightUnit,
): string {
  if (WEIGHT_PR_TYPES.has(pr.type)) return formatWeight(pr.value, unit);
  // Σκορ σε reps (κανόνας reps↔κιλά) — ΠΟΤΕ ως βάρος.
  if (pr.type === 'rep_equivalent') return `≈ ${Math.round(pr.value * 10) / 10}`;
  // Reps στο ίδιο φορτίο: το φορτίο είναι μέρος του ρεκόρ («10 kg × 8»).
  if (pr.type === 'reps_at_load') {
    const reps = String(Math.round(pr.value));
    return pr.weight_kg != null && pr.weight_kg > 0 ? `${formatWeight(pr.weight_kg, unit)} × ${reps}` : reps;
  }
  if (pr.type === 'max_hold' || pr.type === 'session_hold') return `${Math.round(pr.value)}s`;
  if (pr.type === 'relative_strength') return `×${(Math.round(pr.value * 100) / 100).toFixed(2)}`;
  return String(Math.round(pr.value * 10) / 10);
}

export interface PRBodyChange {
  /** αλλαγή συνολικού φορτίου/e1RM σε kg (storage) σε σχέση με το προηγούμενο ρεκόρ */
  valueDeltaKg: number;
  /** αλλαγή σωματικού βάρους σε kg (storage) */
  bodyDeltaKg: number;
  /** το σωματικό βάρος του ρεκόρ είναι κατά προσέγγιση */
  estimated: boolean;
}

const BODY_AWARE: ReadonlySet<string> = new Set(['max_total_load', 'e1rm_total']);

/**
 * Όταν ένα ρεκόρ συνολικού φορτίου ήρθε (και) από αλλαγή σωματικού βάρους,
 * δείξε το ξεκάθαρα: «+2 kg συνολικό φορτίο · σώμα +2 kg». null όταν δεν
 * υπάρχει προηγούμενο ρεκόρ με γνωστό βάρος ή το σώμα δεν άλλαξε.
 */
export function prBodyChange(
  pr: Pick<PersonalRecord, 'type' | 'value' | 'bodyweight_kg' | 'bw_estimated'>,
  prev: Pick<PersonalRecord, 'value' | 'bodyweight_kg'> | null | undefined,
): PRBodyChange | null {
  if (!BODY_AWARE.has(pr.type) || !prev || pr.bodyweight_kg == null || prev.bodyweight_kg == null) {
    return null;
  }
  const bodyDeltaKg = Math.round((pr.bodyweight_kg - prev.bodyweight_kg) * 100) / 100;
  if (bodyDeltaKg === 0) return null;
  return {
    valueDeltaKg: Math.round((pr.value - prev.value) * 100) / 100,
    bodyDeltaKg,
    estimated: !!pr.bw_estimated,
  };
}

/** Προσημασμένη διαφορά στη μονάδα του χρήστη, π.χ. «+2 kg» / «−1.5 kg». */
export function signedWeight(deltaKg: number, unit: WeightUnit): string {
  const v = toDisplayWeight(Math.abs(deltaKg), unit);
  return `${deltaKg < 0 ? '−' : '+'}${v} ${unit}`;
}
