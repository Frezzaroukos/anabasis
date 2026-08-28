/**
 * Κοινό ενδιάμεσο σχήμα για ΟΛΟΥΣ τους workout importers (Strong, Hevy, …).
 *
 * Οι parsers μεταφράζουν το εκάστοτε CSV σε αυτό, και το merge step
 * (merge.ts) ξέρει ΜΟΝΟ αυτό — έτσι ένας μελλοντικός importer (Fitbod,
 * Jefit…) χρειάζεται μόνο νέο parser, όχι νέο import pipeline.
 */

export interface ImportedSet {
  /** 1-based σειρά μέσα στην άσκηση — ίδια λογική με το addSet */
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  /** planks/holds — το Seconds του Strong, duration_seconds του Hevy */
  holdSeconds: number | null;
  rpe: number | null;
  isWarmup: boolean;
  isFailure: boolean;
  setType: string;
  /** σημείωση του σετ από το αρχείο — περνάει αυτούσια στο set entry */
  notes: string | null;
  /** true = κάτι δεν έβγαζε νόημα στη γραμμή — ο χρήστης να το δει στο preview */
  suspect: boolean;
  suspectReason: string | null;
  /** η αρχική γραμμή, για να φαίνεται ΤΙ διαβάστηκε */
  raw: string;
}

export interface ImportedExercise {
  /** όνομα όπως στο αρχείο — το mapping σε δικές μας ασκήσεις γίνεται στο merge */
  name: string;
  sets: ImportedSet[];
}

export interface ImportedWorkout {
  /** μοναδικό key μέσα στο parse — για τα checkboxes του preview */
  key: string;
  /** τοπική ημέρα YYYY-MM-DD */
  date: string;
  /** πραγματική ώρα έναρξης από το αρχείο (ISO) — όχι η ώρα του import */
  startedAtIso: string;
  durationSeconds: number | null;
  name: string | null;
  notes: string | null;
  exercises: ImportedExercise[];
}

/** Γραμμή που δεν διαβάστηκε καθόλου — μετράει στο preview ως προειδοποίηση. */
export interface BadRow {
  line: number;
  reason: string;
  raw: string;
}

export interface WorkoutParseResult {
  workouts: ImportedWorkout[];
  badRows: BadRow[];
}

/** Κοινός parse αριθμών: δέχεται και κόμμα δεκαδικών («72,5»). */
export function parseNum(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Θετικός ακέραιος ή null — για reps/seconds που δεν νοούνται αρνητικά. */
export function parsePosInt(s: string | undefined): number | null {
  const n = parseNum(s);
  if (n == null || n < 0) return null;
  return Math.round(n);
}

/**
 * Τα exports γράφουν «0» στα αχρησιμοποίητα αριθμητικά πεδία (Seconds=0,
 * RPE=0…). Το 0 εκεί σημαίνει «δεν καταγράφηκε», όχι μια πραγματική τιμή —
 * το κάνουμε null ώστε να μην γεμίσουν τα δεδομένα ψεύτικα μηδενικά.
 */
export function nonZero(n: number | null): number | null {
  return n === 0 ? null : n;
}

/** Τοπική ημέρα YYYY-MM-DD ενός Date — ίδιο format με το query layer. */
export function toLocalDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
