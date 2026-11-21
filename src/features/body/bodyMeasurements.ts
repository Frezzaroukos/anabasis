import {
  formatLength,
  parseLengthToCm,
  toDisplayLength,
  type LengthUnit,
} from '@/lib/units';

/**
 * Καθαρά helpers/σταθερές για τις περιφέρειες σώματος (Wave 4).
 * Χωριστά από το component αρχείο (BodyMeasurements.tsx) ώστε το fast-refresh
 * να μη διαμαρτύρεται ότι ένα «component file» εξάγει και functions/constants.
 */

export type MeasurementField =
  | 'waist_cm'
  | 'chest_cm'
  | 'hips_cm'
  | 'arm_cm'
  | 'forearm_cm'
  | 'thigh_cm'
  | 'calf_cm'
  | 'neck_cm';

export const MEASUREMENT_FIELDS: ReadonlyArray<{
  key: MeasurementField;
  /** Το αντίστοιχο camelCase πεδίο του BodyPoint (getBodyTrend). */
  pointKey: string;
  labelKey: string;
}> = [
  { key: 'waist_cm', pointKey: 'waistCm', labelKey: 'body.waist' },
  { key: 'chest_cm', pointKey: 'chestCm', labelKey: 'body.chest' },
  { key: 'hips_cm', pointKey: 'hipsCm', labelKey: 'body.hips' },
  { key: 'arm_cm', pointKey: 'armCm', labelKey: 'body.arm' },
  { key: 'forearm_cm', pointKey: 'forearmCm', labelKey: 'body.forearm' },
  { key: 'thigh_cm', pointKey: 'thighCm', labelKey: 'body.thigh' },
  { key: 'calf_cm', pointKey: 'calfCm', labelKey: 'body.calf' },
  { key: 'neck_cm', pointKey: 'neckCm', labelKey: 'body.neck' },
];

/** Λογικό εύρος περιφέρειας (cm). Πάνω από 300cm δεν είναι άνθρωπος. */
export const MAX_MEASUREMENT_CM = 300;

/** Μηδενικό record περιφερειών (όλα null). */
export function emptyMeasurements(): Record<MeasurementField, number | null> {
  const out = {} as Record<MeasurementField, number | null>;
  for (const { key } of MEASUREMENT_FIELDS) out[key] = null;
  return out;
}

/** Έγκυρη τιμή εισόδου ΣΤΗ ΜΟΝΑΔΑ του χρήστη (0 < x ≤ 300cm σε φυσικό μέγεθος). */
export function isValidMeasurementInput(displayValue: number, unit: LengthUnit): boolean {
  if (!Number.isFinite(displayValue) || displayValue <= 0) return false;
  const cm = parseLengthToCm(displayValue, unit);
  return cm > 0 && cm <= MAX_MEASUREMENT_CM;
}

/** «Διαφορά από την πρώτη καταχώριση» με πρόσημο (+/−) στη μονάδα του χρήστη. */
export function measurementDelta(
  points: Array<number | null>,
  unit: LengthUnit,
): { value: number; label: string } | null {
  const nums = points.filter((p): p is number => p != null);
  if (nums.length < 2) return null;
  const first = nums[0]!;
  const last = nums[nums.length - 1]!;
  const deltaCm = last - first;
  if (deltaCm === 0) return null;
  const shown = toDisplayLength(Math.abs(deltaCm), unit);
  const sign = deltaCm > 0 ? '+' : '−';
  return { value: deltaCm, label: `${sign}${shown} ${unit}` };
}

/** Σημεία για το chart — αντιστοιχίζει το cm πεδίο του BodyPoint σε τιμή μονάδας. */
export function measurementSeries<T extends Record<string, unknown>>(
  trend: T[],
  pointKey: string,
  unit: LengthUnit,
): Array<Record<string, unknown>> {
  return trend.map((p) => {
    const cm = p[pointKey] as number | null | undefined;
    return { ...p, value: cm != null ? toDisplayLength(cm, unit) : null };
  });
}

/** Τιμές μιας ημέρας (cm) — μόνο όσες έχουν τιμή, για compact σύνοψη. */
export function presentMeasurements(
  entry: Partial<Record<MeasurementField, number | null>>,
): Array<{ key: MeasurementField; labelKey: string; value: number }> {
  return MEASUREMENT_FIELDS.filter(({ key }) => entry[key] != null).map(({ key, labelKey }) => ({
    key,
    labelKey,
    value: entry[key]!,
  }));
}

export { formatLength };
