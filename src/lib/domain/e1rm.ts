/**
 * Estimated 1-rep-max calculations.
 * Two industry-standard formulas. Both return kg given (weight kg, reps).
 *
 *   Epley:    1RM = w * (1 + r/30)
 *   Brzycki:  1RM = w * 36 / (37 - r)
 *
 * Brzycki is more accurate for low reps (<10), Epley for higher reps.
 * We default to Epley because it stays defined when reps→37.
 */

export type E1RMFormula = 'epley' | 'brzycki';

export function epley(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export function brzycki(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps >= 37) return epley(weightKg, reps); // formula breaks
  if (reps === 1) return weightKg;
  return (weightKg * 36) / (37 - reps);
}

export function e1rm(
  weightKg: number,
  reps: number,
  formula: E1RMFormula = 'epley',
): number {
  return formula === 'brzycki' ? brzycki(weightKg, reps) : epley(weightKg, reps);
}
