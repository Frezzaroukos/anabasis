/**
 * Parser για τη λίστα θερμίδων από Notion (checkbox list).
 *
 * Η πηγή είναι «όχι ιδανικής μορφής»: math expressions, σχόλια, emoji, και
 * ΛΑΘΗ ΗΜΕΡΟΜΗΝΙΩΝ (ο Ιανουάριος γράφει «01-12-2025»). Γι' αυτό:
 *  - ο ΜΗΝΑΣ έρχεται από το ελληνικό header (Σεπτέμβριος/Οκτώβριος…), όχι από
 *    το date-string της γραμμής,
 *  - το έτος προχωράει αυτόματα όταν περνάμε από Δεκέμβριο σε Ιανουάριο,
 *  - κάθε τιμή εκτός λογικού εύρους σημαδεύεται `needsReview` για human check,
 *  - αδύνατες ημερομηνίες (π.χ. 31 Φεβρουαρίου) σημαδεύονται `invalidDate`
 *    και ΔΕΝ εισάγονται ποτέ — δεν υπάρχει τέτοια μέρα να τις δεχτεί.
 *
 * Καμία μαντεψιά χωρίς σήμανση — ο χρήστης βλέπει τι κατάλαβε το app πριν το import.
 *
 * Ο σκελετός (μήνας-header, year rollover, date validation) ζει στο
 * importers/notionDaily.ts — κοινός με τον weights parser.
 */

import { walkNotionDays } from '@/lib/importers/notionDaily';

export interface ParsedCalorieRow {
  date: string; // YYYY-MM-DD
  calories: number;
  /** true = ασαφής/ύποπτη τιμή· ο χρήστης να την τσεκάρει στο preview */
  needsReview: boolean;
  /** true = η ημερομηνία δεν υπάρχει στο ημερολόγιο — αποκλείεται από το import */
  invalidDate: boolean;
  /** το αρχικό κείμενο, για να το δει ο χρήστης δίπλα */
  raw: string;
}

/**
 * Εξάγει την τελική ημερήσια τιμή από ένα expression.
 * Κανόνας: αν υπάρχει «=», κράτα τον αριθμό μετά το ΤΕΛΕΥΤΑΙΟ «=» (το daily
 * total συνήθως καταλήγει εκεί). Αλλιώς τον πρώτο αριθμό. Χειρίζεται «2.500»
 * (τελεία = χιλιάδες), «~4000», και κόβει σχόλια μετά από «πάω».
 */
function extractCalories(expr: string): { value: number | null; ambiguous: boolean } {
  // κόψε σχόλια που ξεκινούν με «πάω» (μεταφορά θερμίδων σε άλλη μέρα)
  const body = expr.split(/πάω|παω/)[0] ?? expr;
  const eqParts = body.split('=');
  const ambiguous = eqParts.length > 2 || /[+\-_]/.test(body.replace(/^\s*[~\d.,\s]+$/, ''));

  const target = eqParts.length > 1 ? eqParts[eqParts.length - 1]! : body;
  // βρες τον πρώτο «καθαρό» αριθμό, με προαιρετική τελεία χιλιάδων
  const m = target.match(/~?\s*(\d[\d.]*)/);
  if (!m) return { value: null, ambiguous: true };
  const digits = m[1]!.replace(/\./g, ''); // «2.500» → «2500»
  const value = Number(digits);
  if (!Number.isFinite(value) || value === 0) return { value: null, ambiguous: true };
  return { value, ambiguous };
}

export interface ParseResult {
  rows: ParsedCalorieRow[];
  /** μήνες που δεν αναγνωρίστηκαν header — ο χρήστης να προσθέσει context */
  monthsFound: number;
}

/**
 * Parse ολόκληρου του paste. Ξεκινά από `startYear` (default 2025) και το
 * αυξάνει όταν δει Ιανουάριο μετά από μεγαλύτερο μήνα.
 */
export function parseNotionCalories(text: string, startYear = 2025): ParseResult {
  const walk = walkNotionDays(text, startYear);
  const rows: ParsedCalorieRow[] = [];
  const seen = new Set<string>();

  for (const line of walk.lines) {
    const { value, ambiguous } = extractCalories(line.valueText);
    if (value == null) continue;

    // κράτα την πρώτη εμφάνιση ανά μέρα — οι αδύνατες ημερομηνίες δεν
    // «καίνε» τη θέση μιας πραγματικής
    if (!line.invalidDate) {
      if (seen.has(line.date)) continue;
      seen.add(line.date);
    }

    // λογικό εύρος ημερήσιων θερμίδων· εκτός → σημάδεψε για έλεγχο
    const needsReview = ambiguous || line.invalidDate || value < 800 || value > 6000;
    rows.push({
      date: line.date,
      calories: value,
      needsReview,
      invalidDate: line.invalidDate,
      raw: line.valueText.trim().slice(0, 80),
    });
  }

  return { rows, monthsFound: walk.monthsFound };
}
