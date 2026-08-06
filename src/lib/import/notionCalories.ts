/**
 * Parser για τη λίστα θερμίδων από Notion (checkbox list).
 *
 * Η πηγή είναι «όχι ιδανικής μορφής»: math expressions, σχόλια, emoji, και
 * ΛΑΘΗ ΗΜΕΡΟΜΗΝΙΩΝ (ο Ιανουάριος γράφει «01-12-2025»). Γι' αυτό:
 *  - ο ΜΗΝΑΣ έρχεται από το ελληνικό header (Σεπτέμβριος/Οκτώβριος…), όχι από
 *    το date-string της γραμμής,
 *  - το έτος προχωράει αυτόματα όταν περνάμε από Δεκέμβριο σε Ιανουάριο,
 *  - κάθε τιμή εκτός λογικού εύρους σημαδεύεται `needsReview` για human check.
 *
 * Καμία μαντεψιά χωρίς σήμανση — ο χρήστης βλέπει τι κατάλαβε το app πριν το import.
 */

export interface ParsedCalorieRow {
  date: string; // YYYY-MM-DD
  calories: number;
  /** true = ασαφής/ύποπτη τιμή· ο χρήστης να την τσεκάρει στο preview */
  needsReview: boolean;
  /** το αρχικό κείμενο, για να το δει ο χρήστης δίπλα */
  raw: string;
}

const GREEK_MONTHS: Record<string, number> = {
  ιανουαριος: 1, φεβρουαριος: 2, μαρτιος: 3, απριλιος: 4, μαιος: 5, ιουνιος: 6,
  ιουλιος: 7, αυγουστος: 8, σεπτεμβριος: 9, σεπτεμβριος_: 9, οκτωβριος: 10,
  νοεμβριος: 11, δεκεμβριος: 12,
};

/** Αφαιρεί τόνους/διαλυτικά ώστε «Σεπτέμβριος» ≈ «σεπτεμβριος». */
function normalizeGreek(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^α-ω]/g, '');
}

function detectMonth(line: string): number | null {
  const norm = normalizeGreek(line);
  for (const [name, month] of Object.entries(GREEK_MONTHS)) {
    // «σεμπτεμβριος» (ο χρήστης το γράφει με μ) → πιάσε και τις δύο γραφές
    if (norm.includes(name) || norm.includes(name.replace('σεπτ', 'σεμπτ'))) {
      return month;
    }
  }
  return null;
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
  const lines = text.split(/\r?\n/);
  const rows: ParsedCalorieRow[] = [];
  let month: number | null = null;
  let year = startYear;
  let prevMonth = 0;
  let monthsFound = 0;
  const seen = new Set<string>();

  for (const line of lines) {
    const headerMonth = detectMonth(line);
    // header γραμμή = σκέτος μήνας χωρίς ημερομηνία/τιμή
    if (headerMonth && !/\d{1,2}\s*[-/]\s*\d/.test(line)) {
      if (prevMonth >= 9 && headerMonth <= 8) year += 1; // Δεκ→Ιαν = νέο έτος
      month = headerMonth;
      prevMonth = headerMonth;
      monthsFound += 1;
      continue;
    }

    // γραμμή δεδομένων: «DD-MM-YYYY: value» ή «DD: value»
    const m = line.match(/(\d{1,2})\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{2,4}\s*[:：]\s*(.+)/)
      ?? line.match(/^[-*\s[\]x]*(\d{1,2})\s*[:：]\s*(.+)/);
    if (!m || month == null) continue;

    const day = Number(m[1]);
    if (day < 1 || day > 31) continue;
    const { value, ambiguous } = extractCalories(m[2]!);
    if (value == null) continue;

    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (seen.has(date)) continue; // κράτα την πρώτη εμφάνιση ανά μέρα
    seen.add(date);

    // λογικό εύρος ημερήσιων θερμίδων· εκτός → σημάδεψε για έλεγχο
    const needsReview = ambiguous || value < 800 || value > 6000;
    rows.push({ date, calories: value, needsReview, raw: m[2]!.trim().slice(0, 80) });
  }

  return { rows, monthsFound };
}
