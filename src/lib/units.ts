import type { WeightUnit } from './db/types';

/**
 * kg ↔ lb μετατροπές (ορισμός SI, ακριβής): 1 lb = 0.45359237 kg. Το storage
 * στη Dexie είναι ΠΑΝΤΑ kg — αυτό το module είναι το ΜΟΝΟ σημείο μετατροπής,
 * στο boundary του display/input. Ό,τι μπαίνει στη βάση περνάει από
 * `parseWeightToKg`, ό,τι βγαίνει στην οθόνη περνάει από `formatWeight`.
 */
const KG_PER_LB = 0.45359237;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/**
 * 'plate' = φορτία (σετ, e1RM, όγκος, δισκάκια) — βήμα 0.5, «plate-realistic»
 * αριθμοί αντί για ψευδο-ακρίβεια από τη μετατροπή kg→lb (π.χ. 220.46226lb).
 * 'body' = σωματικό βάρος — βήμα 0.1, όση ακρίβεια δίνει μια ζυγαριά.
 */
export type WeightGranularity = 'plate' | 'body';

const GRANULARITY_STEP: Record<WeightGranularity, number> = {
  plate: 0.5,
  body: 0.1,
};

/** Στρογγυλοποίηση σε βήμα + καθάρισμα float noise (π.χ. 0.30000000000000004). */
function roundToStep(value: number, step: number): number {
  const rounded = Math.round(value / step) * step;
  return Math.round(rounded * 1e6) / 1e6;
}

/**
 * Η τιμή (ΧΩΡΙΣ μονάδα) όπως θα φαινόταν στην επιλεγμένη μονάδα — για inputs
 * (π.χ. προ-γέμισμα ενός πεδίου) όπου ο καλών θέλει έναν αριθμό, όχι string.
 */
export function toDisplayWeight(
  kg: number,
  unit: WeightUnit,
  granularity: WeightGranularity = 'plate',
): number {
  const raw = unit === 'lb' ? kgToLb(kg) : kg;
  return roundToStep(raw, GRANULARITY_STEP[granularity]);
}

export interface FormatWeightOptions {
  granularity?: WeightGranularity;
  /** false = μόνο ο αριθμός, χωρίς «kg»/«lb» πίσω (π.χ. quick-log preview). */
  withUnit?: boolean;
}

/** Format ενός βάρους αποθηκευμένου σε kg, στη μονάδα του χρήστη. */
export function formatWeight(
  kg: number,
  unit: WeightUnit,
  opts: FormatWeightOptions = {},
): string {
  const { granularity = 'plate', withUnit = true } = opts;
  const value = toDisplayWeight(kg, unit, granularity);
  return withUnit ? `${value} ${unit}` : String(value);
}

/**
 * Είσοδος του χρήστη (γραμμένη στη ΔΙΚΗ ΤΟΥ μονάδα) → kg για αποθήκευση.
 * 2 δεκαδικά kg: αρκετά ακριβές για οποιοδήποτε πραγματικό σενάριο, χωρίς
 * float-noise ουρές να κάθονται στη βάση.
 */
export function parseWeightToKg(value: number, unit: WeightUnit): number {
  const kg = unit === 'lb' ? lbToKg(value) : value;
  return Math.round(kg * 100) / 100;
}
