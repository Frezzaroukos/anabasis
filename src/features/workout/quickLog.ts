/**
 * Quick-log parser: καταγραφή ολόκληρης άσκησης σε ΜΙΑ γραμμή, όπως στο
 * σημειωματάριο/Notion, αντί για tap-ανά-σετ.
 *
 * Ο χρήστης γράφει το βάρος και μετά τις επαναλήψεις χωρισμένες (το βάρος
 * γράφεται στη ΔΙΚΗ ΤΟΥ μονάδα — `unit` — και μετατρέπεται σε kg για
 * αποθήκευση· το output `weightKg` είναι ΠΑΝΤΑ kg):
 *   «80 5,4,3,2»   → 80(unit) × 5, 4, 3, 2   (4 σετ)
 *   «80 5+4+3»     → 80(unit) × 5, 4, 3       (το «+» όπως το γράφει στο Notion)
 *   «80x5»         → 80(unit) × 5             (ένα σετ)
 *   «80kg 5 4 3»   → με μονάδα και κενά (το «kg» εδώ είναι απλά λέξη-θόρυβος, όχι νόημα)
 *   «5,4,3»        → χωρίς βάρος (bodyweight: reps μόνο)
 *   «84,4 5»       → 84.4(unit) × 5           (κόμμα ΠΡΙΝ ψηφίο = δεκαδικό βάρους)
 *   «84,4»         → άκυρο (δεκαδικό βάρος ΧΩΡΙΣ reps — όχι 2 ψευδο-σετ)
 *
 * Βασισμένο στην πραγματική μορφή του χρήστη: «Bench press:80kg 5+4+3+2».
 */

import type { WeightUnit } from '@/lib/db/types';
import { parseWeightToKg } from '@/lib/units';

export interface QuickSet {
  weightKg: number | null;
  reps: number;
}

/**
 * Χωρίζει «βάρος» από «επαναλήψεις». Το πρώτο token (με προαιρετικό kg/δεκαδικό)
 * είναι το βάρος· τα υπόλοιπα είναι reps. Αν λείπει βάρος (μόνο reps), weight=null.
 */
const toReps = (part: string): number[] =>
  part
    .replace(/\+/g, ' ')
    .split(/[\s,]+/)
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.round(n));

export function parseQuickSets(
  input: string,
  weighted: boolean,
  unit: WeightUnit = 'kg',
): QuickSet[] {
  // «kg» έξω· «×/x» → κενό ώστε «80x5» να χωριστεί σε βάρος|reps.
  const s = input.trim().toLowerCase().replace(/kg/g, ' ').replace(/[×x]/g, ' ').trim();
  if (!s) return [];

  const firstSpace = s.search(/\s/);

  // Υπάρχει κενό → «<βάρος> <reps…>». Το βάρος μπορεί να έχει δεκαδικό κόμμα (84,4).
  if (firstSpace !== -1) {
    const weightRaw = s.slice(0, firstSpace).replace(',', '.');
    const weight = Number(weightRaw);
    const reps = toReps(s.slice(firstSpace + 1));
    if (!Number.isFinite(weight) || weight <= 0 || reps.length === 0) return [];
    const weightKg = weighted ? parseWeightToKg(weight, unit) : null;
    return reps.map((r) => ({ weightKg, reps: r }));
  }

  // Χωρίς κενό, ένα κόμμα, δύο αριθμοί («84,4») σε weighted mode: μοιάζει με
  // δεκαδικό βάρος γραμμένο με κόμμα (84.4), όχι με 2 σετ 84 & 4 reps —
  // αλλιώς λείπουν τα reps και το «βάρος» θα έπρεπε να είναι άκυρο, όχι
  // δύο ψευδο-σετ bodyweight (bug: «84,4» παρερμηνευόταν σε 84×1 + 4×1).
  if (weighted && /^\d+,\d+$/.test(s)) return [];

  // Χωρίς κενό: είτε λίστα reps (bodyweight «5,4,3») είτε σκέτο βάρος (άκυρο).
  const reps = toReps(s);
  if (reps.length === 0) return [];
  // Ένας μόνος αριθμός σε weighted mode = «μόνο βάρος», δεν φτιάχνει σετ.
  if (weighted && reps.length === 1 && !/[,+]/.test(s)) return [];
  return reps.map((r) => ({ weightKg: null, reps: r }));
}
