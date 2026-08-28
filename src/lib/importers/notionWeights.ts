/**
 * Parser για τα ημερήσια ΒΑΡΗ από τις Notion «Weight goals» σελίδες.
 *
 * Ίδια δομή με τη λίστα θερμίδων (ελληνικός μήνας-header, γραμμές
 * «DD-MM-YYYY: value» με αναξιόπιστα date-strings) — ο σκελετός έρχεται
 * από το notionDaily.ts. Εδώ αλλάζει μόνο η ερμηνεία της τιμής:
 * δεκαδικά κιλά («71,5», «71.5», «71.5kg», «~72»), όχι χιλιάδες.
 */

import { walkNotionDays } from './notionDaily';

export interface ParsedWeightRow {
  date: string; // YYYY-MM-DD
  weightKg: number;
  /** true = ασαφής/ύποπτη τιμή· ο χρήστης να την τσεκάρει στο preview */
  needsReview: boolean;
  /** true = η ημερομηνία δεν υπάρχει στο ημερολόγιο — αποκλείεται από το import */
  invalidDate: boolean;
  raw: string;
}

export interface WeightParseResult {
  rows: ParsedWeightRow[];
  monthsFound: number;
}

/**
 * Εξάγει κιλά από το κείμενο της γραμμής. Το κόμμα είναι δεκαδικό («71,5»),
 * ΟΧΙ χιλιάδες — κανείς δεν ζυγίζει 71.500 κιλά. Σχόλια/βελάκια μετά τον
 * πρώτο αριθμό απλώς σημαδεύουν τη γραμμή ως ασαφή.
 */
function extractWeight(expr: string): { value: number | null; ambiguous: boolean } {
  const m = expr.match(/~?\s*(\d{1,3}(?:[.,]\d{1,2})?)/);
  if (!m) return { value: null, ambiguous: true };
  const value = Number(m[1]!.replace(',', '.'));
  if (!Number.isFinite(value) || value === 0) return { value: null, ambiguous: true };

  // υπάρχει και ΔΕΥΤΕΡΟΣ αριθμός ή πράξη; τότε δεν είναι σκέτη μέτρηση
  const rest = expr.slice((m.index ?? 0) + m[0]!.length).replace(/\s*(kg|κιλα|κιλά)\.?/i, '');
  const ambiguous = /\d/.test(rest) || /[=+]/.test(expr);
  return { value, ambiguous };
}

/** Parse ολόκληρου του paste — ίδιο συμβόλαιο με το parseNotionCalories. */
export function parseNotionWeights(text: string, startYear = 2025): WeightParseResult {
  const walk = walkNotionDays(text, startYear);
  const rows: ParsedWeightRow[] = [];
  const seen = new Set<string>();

  for (const line of walk.lines) {
    const { value, ambiguous } = extractWeight(line.valueText);
    if (value == null) continue;

    if (!line.invalidDate) {
      if (seen.has(line.date)) continue;
      seen.add(line.date);
    }

    // λογικό εύρος σωματικού βάρους ενήλικα· εκτός → σημάδεψε για έλεγχο
    const needsReview = ambiguous || line.invalidDate || value < 35 || value > 200;
    rows.push({
      date: line.date,
      weightKg: value,
      needsReview,
      invalidDate: line.invalidDate,
      raw: line.valueText.trim().slice(0, 80),
    });
  }

  return { rows, monthsFound: walk.monthsFound };
}
