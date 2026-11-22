import type { WeightUnit } from '@/lib/db/types';
import { toDisplayWeight } from '@/lib/units';

/** Βήμα ζυγαριάς: 0.1 kg ή 0.5 lb — ό,τι διαβάζει κανείς σε μια οικιακή ζυγαριά. */
export function weightStep(unit: WeightUnit): number {
  return unit === 'lb' ? 0.5 : 0.1;
}

/**
 * Επόμενη τιμή πεδίου βάρους στη μονάδα που βλέπει ο χρήστης.
 * Κενό ή άκυρο πεδίο ξεκινά από 0. Δεν κατεβαίνει κάτω από το 0.
 */
export function stepDisplayWeight(
  current: string,
  direction: -1 | 1,
  unit: WeightUnit,
): string {
  const step = weightStep(unit);
  const parsed = Number(current.trim().replace(',', '.'));
  const base = Number.isFinite(parsed) ? parsed : 0;
  const next = Math.max(0, Math.round((base + direction * step) * 10) / 10);
  return String(next);
}

/** Αριθμός για input: ίδια στρογγυλοποίηση με τη ζυγαριά (`body` = 0.1). */
export function formatDisplayWeight(kg: number, unit: WeightUnit): string {
  return String(toDisplayWeight(kg, unit, 'body'));
}

/** Κείμενο πεδίου → αριθμός στη μονάδα του χρήστη. Κενό/άκυρο = null. */
export function parseDisplayWeight(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
