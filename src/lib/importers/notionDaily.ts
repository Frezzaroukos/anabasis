/**
 * Κοινός σκελετός για τα Notion daily-log pastes (θερμίδες, βάρος…).
 *
 * Η δομή και τα προβλήματα είναι ΙΔΙΑ σε όλες τις σελίδες του vault:
 * ελληνικός μήνας-header, γραμμές «DD-MM-YYYY: value» με ΛΑΘΟΣ date-strings,
 * year rollover στο Δεκ→Ιαν. Το κρατάμε σε ΕΝΑ μέρος ώστε καλύτερη λογική
 * (π.χ. έλεγχος αδύνατων ημερομηνιών) να ωφελεί όλους τους parsers μαζί.
 */

const GREEK_MONTHS: Record<string, number> = {
  ιανουαριος: 1, φεβρουαριος: 2, μαρτιος: 3, απριλιος: 4, μαιος: 5, ιουνιος: 6,
  ιουλιος: 7, αυγουστος: 8, σεπτεμβριος: 9, οκτωβριος: 10,
  νοεμβριος: 11, δεκεμβριος: 12,
};

/** Αφαιρεί τόνους/διαλυτικά ώστε «Σεπτέμβριος» ≈ «σεπτεμβριος». */
export function normalizeGreek(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^α-ω]/g, '');
}

export function detectMonth(line: string): number | null {
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
 * Υπάρχει αυτή η μέρα στο ημερολόγιο; Το «2025-02-31» ΔΕΝ είναι ημερομηνία —
 * χωρίς αυτόν τον έλεγχο τέτοιες τιμές έμπαιναν αθόρυβα στα body_metrics.
 */
export function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  // day 0 του ΕΠΟΜΕΝΟΥ μήνα = τελευταία μέρα αυτού του μήνα
  return day <= new Date(year, month, 0).getDate();
}

export interface NotionDayLine {
  /** YYYY-MM-DD — μπορεί να είναι «αδύνατη» ημερομηνία, βλ. invalidDate */
  date: string;
  /** true = δεν υπάρχει στο ημερολόγιο (π.χ. 31 Φεβρουαρίου) */
  invalidDate: boolean;
  /** το κείμενο μετά το «:» — η τιμή, όπως τη βλέπει ο κάθε parser */
  valueText: string;
}

export interface NotionWalkResult {
  lines: NotionDayLine[];
  /** μήνες που αναγνωρίστηκαν από header — 0 σημαίνει άχρηστο paste */
  monthsFound: number;
}

/**
 * Περπατάει το paste γραμμή-γραμμή: ο ΜΗΝΑΣ έρχεται πάντα από το ελληνικό
 * header (τα date-strings της σελίδας λένε ψέματα), το έτος κάνει rollover
 * σε Δεκ→Ιαν. Η ερμηνεία της ΤΙΜΗΣ αφήνεται στον καλούντα parser.
 */
export function walkNotionDays(text: string, startYear: number): NotionWalkResult {
  const lines = text.split(/\r?\n/);
  const out: NotionDayLine[] = [];
  let month: number | null = null;
  let year = startYear;
  let prevMonth = 0;
  let monthsFound = 0;

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

    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    out.push({
      date,
      invalidDate: !isRealDate(year, month, day),
      valueText: m[2]!,
    });
  }

  return { lines: out, monthsFound };
}
