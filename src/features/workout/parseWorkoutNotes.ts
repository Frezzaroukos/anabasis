/**
 * Multi-exercise workout notes parser ("Quick Paste").
 *
 * Μετατρέπει ελεύθερες σημειώσεις προπόνησης (μία άσκηση ανά γραμμή, π.χ. από
 * Notes/Telegram/Notion) σε δομημένες ασκήσεις + σετ, με έξυπνο ταίριασμα στη
 * βιβλιοθήκη ασκήσεων του χρήστη (Ελληνικά + Αγγλικά + συντομογραφίες).
 *
 * Καθαρό module (χωρίς DB calls) — εύκολο στον έλεγχο και στο live preview.
 */

import type { Exercise, WeightUnit } from '@/lib/db/types';
import { parseQuickSets, type QuickSet } from './quickLog';

export type MatchConfidence = 'exact' | 'alias' | 'fuzzy' | 'memory' | 'none';

export interface ParsedWorkoutLine {
  id: string;
  rawLine: string;
  rawName: string;
  setsText: string;
  matchedExerciseId: string | null;
  suggestedName: string;
  confidence: MatchConfidence;
  sets: QuickSet[];
  /** Προαιρετική σημείωση από το κείμενο (π.χ. «Standing tall arms») αν η άσκηση ταίριαξε σε γενικότερη. */
  noteHint: string | null;
  /** Ασυνήθιστη τιμή (π.χ. 1100kg από χαμένο «+») — σημαδεύεται στο preview για έλεγχο. */
  hasSuspectValues: boolean;
  /** Βρέθηκαν αριθμοί αλλά κανένα έγκυρο σετ (π.χ. «80kg 0») — δείχνεται για διόρθωση, δεν αποθηκεύεται. */
  unreadable: boolean;
  /** Η άσκηση είναι hold (τα «reps» είναι δευτερόλεπτα). */
  isHold: boolean;
}

/** Μνήμη αντιστοιχίσεων: normalized όνομα σημείωσης → exercise id (από παλιότερες διορθώσεις). */
export type ExerciseMemory = Record<string, string>;

const SUSPECT_WEIGHT_KG = 350;
const SUSPECT_REPS = 100;
const SUSPECT_HOLD_SECONDS = 600;

/** Κανονικοποίηση για σύγκριση: πεζά, χωρίς τόνους (Ελληνικά/Λατινικά), χωρίς σημεία στίξης. */
export function normalizeExerciseText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .replace(/[._/\\–—-]+/g, ' ')
    .replace(/[^a-z0-9\u0370-\u03ff\u1f00-\u1fff\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Γνωστές συντομογραφίες γυμναστηρίου & calisthenics → κανονικό όνομα αναζήτησης.
 * Τα κλειδιά είναι ήδη normalized. Το ταίριασμα ελέγχεται ενάντια στη βιβλιοθήκη
 * του χρήστη (seeded + custom) — ποτέ δεν «εφευρίσκει» ID που δεν υπάρχει.
 */
const ALIAS_RULES_SRC: Array<{ patterns: RegExp[]; targets: string[] }> = [
  {
    patterns: [/\bmu\b/, /\bmuscle\s*ups?\b/, /\bμασλ\s*απ/],
    targets: ['muscle up'],
  },
  {
    patterns: [
      /\bw\s*pull\s*ups?\b/,
      /\bwpu\b/,
      /\bweighted\s*pull\s*ups?\b/,
      /\bελξεισ\s*με\s*βαροσ/,
    ],
    targets: ['weighted pull ups', 'pull ups'],
  },
  {
    patterns: [/\bpull\s*ups?\b/, /\bμονοζυγο/, /\bελξεισ\b/],
    targets: ['pull ups', 'weighted pull ups'],
  },
  {
    patterns: [/\bchin\s*ups?\b/, /\bw\s*chin\s*ups?\b/],
    targets: ['chin ups'],
  },
  {
    patterns: [/\bw\s*dips?\b/, /\bweighted\s*dips?\b/],
    targets: ['weighted dips', 'dips'],
  },
  {
    patterns: [/\bring\s*dips?\b/],
    targets: ['ring dips', 'dips'],
  },
  {
    patterns: [/\bdips?\b/, /\bβυθισεις/],
    targets: ['dips', 'weighted dips'],
  },
  {
    patterns: [/\bincline\s*(?:bench|press)?\b/, /\bεπικλινης/],
    targets: ['incline bench press'],
  },
  {
    patterns: [/\bbench(?:\s*press)?\b/, /\bbp\b/, /\bπαγκος/],
    targets: ['bench press'],
  },
  {
    patterns: [/\b(?:ohp|overhead\s*press)\b/],
    targets: ['overhead press', 'shoulder press'],
  },
  {
    patterns: [/\bshoulder\s*press\b/, /\bπιεσεις\s*ωμων/],
    targets: ['shoulder press', 'overhead press'],
  },
  {
    patterns: [/\bhammer\s*curls?\b/],
    targets: ['hammer curls', 'biceps curls'],
  },
  {
    patterns: [/\breverse\s*curls?\b/],
    targets: ['reverse curls'],
  },
  {
    patterns: [/\bbiceps?(?:\s*curls?)?\b/, /\bδικεφαλ/],
    targets: ['biceps curls'],
  },
  {
    patterns: [/\btriceps?\b/, /\btri\b/, /\bτρικεφαλ/],
    targets: ['triceps extension'],
  },
  {
    patterns: [/\b(?:planche|blanche|πλανς)/],
    targets: ['planche raise'],
  },
  {
    patterns: [/\b(?:fl|front\s*lever|sat)\b/],
    targets: ['front lever row'],
  },
  {
    patterns: [/\bseated\s*rows?\b/],
    targets: ['seated row', 'barbell row'],
  },
  {
    patterns: [/\bbarbell\s*rows?\b/, /\bbb\s*rows?\b/],
    targets: ['barbell row'],
  },
  {
    patterns: [/\brows?\b/, /\bκωπηλατικ/],
    targets: ['seated row', 'barbell row', 'front lever row'],
  },
  {
    patterns: [/\blat\s*pull\s*downs?\b/, /\blat\s*pulldown\b/],
    targets: ['lat pulldown'],
  },
  {
    patterns: [/\blateral\s*raises?\b/, /\bπλαγιες\s*αρσεις/],
    targets: ['lateral raise'],
  },
  {
    patterns: [/\bhspu\b/, /\bhandstand\s*push\s*ups?\b/],
    targets: ['handstand push ups'],
  },
  {
    patterns: [/\bpush\s*ups?\b/, /\bκαμψεις/],
    targets: ['push ups'],
  },
  {
    patterns: [/\b(?:back\s*)?squats?\b/, /\bκαθισματα/],
    targets: ['back squat'],
  },
  {
    patterns: [/\brdl\b/, /\bromanian\s*deadlift\b/],
    targets: ['romanian deadlift'],
  },
  {
    patterns: [/\b(?:dl|deadlifts?)\b/, /\bαρσεις\s*θανατου/],
    targets: ['deadlift'],
  },
  {
    patterns: [/\babs\b/, /\bκοιλιακ/],
    targets: ['abs', 'hanging leg raise'],
  },
  {
    patterns: [/\bcalves\b/, /\bcalf\b/, /\bγαμπ/],
    targets: ['calf raise'],
  },
];

/**
 * Το `\b` της JS θεωρεί «γράμματα» μόνο τα ASCII — στα ελληνικά δεν ταιριάζει
 * ποτέ (έτσι οι ελληνικοί κανόνες παραπάνω δεν δούλευαν). Το αντικαθιστούμε με
 * Unicode όριο λέξης (lookarounds πάνω σε \p{L}\p{N}).
 */
const UNI_B = '(?:(?<![\\p{L}\\p{N}])(?=[\\p{L}\\p{N}])|(?<=[\\p{L}\\p{N}])(?![\\p{L}\\p{N}]))';
const ALIAS_RULES = ALIAS_RULES_SRC.map((rule) => ({
  targets: rule.targets,
  patterns: rule.patterns.map((re) => new RegExp(re.source.replace(/\\b/g, UNI_B).replace(/ς/g, 'σ'), 'u')),
}));

function stripOuterWrapper(line: string): string {
  let s = line.trim();
  // Strip bullet/numbering prefixes like "- ", "• ", "1. ", "(." from pasted notes.
  s = s.replace(/^(?:[-•*]\s+|\d+[.)]\s+|\(\.\s*)/, '').trim();
  // Strip unmatched trailing ")" if the line had no matching "(" (e.g. from wrapping the whole paste in parens).
  const opens = (s.match(/\(/g) ?? []).length;
  const closes = (s.match(/\)/g) ?? []).length;
  if (closes > opens && s.endsWith(')')) {
    s = s.slice(0, -1).trim();
  }
  return s;
}

/**
 * Προ-επεξεργασία γραμμής: φέρνει τις πολλές «ανθρώπινες» γραφές στη μορφή που
 * καταλαβαίνει ο quickLog parser. Δεν αγγίζει το όνομα της άσκησης.
 *   «15″ 12″ 10″» / «3x20s» → δευτερόλεπτα ως απλοί αριθμοί
 *   «80 κιλά» → 80kg · «4×8» → 4x8 · «5/5/4» → 5,5,4
 *   «3x5 @80» → 80kg 3x5 · «+20kg» → 20kg · «BW+10» → 10kg
 *   «3 sets of 8» / «3 σετ των 8» → 3x8 · «3x6 bw» → bw 3x6
 *   «… each / ανά πλευρά» → αφαιρείται
 */
export function normalizeNoteLine(line: string): string {
  let s = line;
  s = s.replace(/[×✕✖]/g, 'x');
  s = s.replace(/(\d)\s*(?:″|”|“|"|''|′′)/g, '$1');
  s = s.replace(/(\d)\s*(?:secs?|sec\.|seconds?|δευτ(?:ερόλεπτα|\.)?|s)(?![\p{L}\d])/giu, '$1');
  s = s.replace(/(\d+(?:[.,]\d+)?)\s*(?:κιλά|κιλα|κιλό|κιλο|κ\.)(?![\p{L}\d])/giu, '$1kg');
  s = s.replace(/(\d)\s*kgs?\b/gi, '$1kg').replace(/(\d)\s*kilos?\b/gi, '$1kg');
  // 3x5 @80  →  80kg 3x5
  s = s.replace(/(\d+\s*x\s*\d+(?:[.,]\d+)?)\s*@\s*(\d+(?:[.,]\d+)?)(?:\s*(kg|lbs?))?/gi, (_m, sets: string, w: string, u?: string) => `${w}${u ?? 'kg'} ${sets}`);
  // BW+10 / bw +10kg → 10kg ·  +20kg → 20kg
  s = s.replace(/\b(?:bw|bodyweight)\s*\+\s*(\d+(?:[.,]\d+)?)(?:\s*(kg|lbs?))?/gi, (_m, w: string, u?: string) => `${w}${u ?? 'kg'}`);
  s = s.replace(/(^|\s)\+\s*(\d+(?:[.,]\d+)?\s*(?:kg|lbs?))/gi, '$1$2');
  // «3 sets of 8»
  s = s.replace(/(\d+)\s*(?:sets?|σετ)\s*(?:of|x|των|με)\s*(\d+(?:[.,]\d+)?)/giu, '$1x$2');
  // 5/5/4 → 5,5,4 (όχι ημερομηνίες/κλάσματα με κενά)
  s = s.replace(/(?<![\d/])(\d+(?:\/\d+){1,})(?![\d/])/g, (m) => m.replace(/\//g, ','));
  // each / per side
  s = s.replace(/\s+(?:each|per\s+side|ανά\s+πλευρά|ανα\s+πλευρα|\/side)\s*$/giu, '');
  // «… 3x6 bw» → «bw 3x6»
  s = s.replace(/^(.*?)\s+((?:\d+x)?\d[\d.,+x\s]*?)\s+(bw|bodyweight)\s*$/i, '$1 $3 $2');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Χωρίζει μια γραμμή σε «όνομα άσκησης» + «σετ».
 * Ψάχνει το πρώτο `:` ή `;` έξω από παρενθέσεις (ώστε παρενθετικά σχόλια στο
 * όνομα όπως «Rows machine για sat(καλησθενικη άσκηση ):18kg 4xmax» να μένουν
 * στο όνομα). Αλλιώς χωρίζει στον πρώτο «αριθμητικό» όρο που ξεκινά μετά από
 * κενό (π.χ. «Bench 80kg 5+5», «Squat 100 5,5,5», «Έλξεις 4x8»).
 */
function splitNameAndSets(line: string): { rawName: string; setsText: string } | null {
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;
    else if (depth === 0 && (ch === ':' || ch === ';')) {
      const name = line.slice(0, i).trim();
      const rest = line.slice(i + 1).trim();
      if (name && rest) return { rawName: name, setsText: rest };
    }
  }

  const dashMatch = line.match(/^(.+?)\s+[–—]\s+(.+)$/);
  if (dashMatch && dashMatch[1] && dashMatch[2]) {
    return { rawName: dashMatch[1].trim(), setsText: dashMatch[2].trim() };
  }

  // Πρώτος αριθμός που ξεκινά token (μετά από κενό) έξω από παρένθεση.
  depth = 0;
  for (let i = 1; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;
    else if (depth === 0 && /\d/.test(ch) && /\s/.test(line[i - 1]!)) {
      const name = line.slice(0, i).trim();
      if (name.length > 1) return { rawName: name, setsText: line.slice(i).trim() };
    }
  }
  return null;
}

export function matchExerciseName(
  rawName: string,
  exercises: Exercise[],
  memory: ExerciseMemory = {},
): { exercise: Exercise | null; confidence: MatchConfidence; forceBodyweight: boolean } {
  const norm = normalizeExerciseText(rawName);
  const forceBodyweight = /\b(?:bw|bodyweight)\b/.test(norm);
  if (!norm) return { exercise: null, confidence: 'none', forceBodyweight };

  const active = exercises.filter((e) => !e.is_archived && e.deleted_at == null);
  const indexed = active.map((ex) => ({
    ex,
    norm: normalizeExerciseText(ex.name),
    tokens: normalizeExerciseText(ex.name).split(' ').filter(Boolean),
  }));

  // 0. Ό,τι έχει διορθώσει ο ίδιος ο χρήστης σε προηγούμενο paste.
  const remembered = memory[norm];
  if (remembered) {
    const hit = indexed.find((item) => item.ex.id === remembered);
    if (hit) return { exercise: hit.ex, confidence: 'memory', forceBodyweight };
  }

  // 1. Exact normalized match
  const exact = indexed.find((item) => item.norm === norm);
  if (exact) return { exercise: exact.ex, confidence: 'exact', forceBodyweight };

  // 2. Alias rules (handles abbreviations, Greek names, typos like Blanche → Planche Raise)
  for (const rule of ALIAS_RULES) {
    if (rule.patterns.some((re) => re.test(norm))) {
      for (const target of rule.targets) {
        const hit =
          indexed.find((item) => item.norm === target) ??
          indexed.find((item) => item.norm.includes(target));
        if (hit) return { exercise: hit.ex, confidence: 'alias', forceBodyweight };
      }
    }
  }

  // 3. Substring / token overlap against user's exercise library
  const queryTokens = norm
    .split(' ')
    .filter((tok) => tok.length >= 2 && tok !== 'bw' && tok !== 'reps' && tok !== 'για');
  if (queryTokens.length === 0) return { exercise: null, confidence: 'none', forceBodyweight };

  let best: { ex: Exercise; score: number } | null = null;
  for (const item of indexed) {
    if (item.norm.includes(norm) || norm.includes(item.norm)) {
      const score = Math.min(item.norm.length, norm.length) / Math.max(item.norm.length, norm.length) + 0.5;
      if (!best || score > best.score) best = { ex: item.ex, score };
      continue;
    }
    const overlap = queryTokens.filter((qt) =>
      item.tokens.some((et) => et === qt || (qt.length >= 4 && (et.startsWith(qt) || qt.startsWith(et)))),
    ).length;
    if (overlap > 0) {
      const score = overlap / Math.max(item.tokens.length, 1);
      if (score >= 0.5 && (!best || score > best.score)) {
        best = { ex: item.ex, score };
      }
    }
  }

  if (best) return { exercise: best.ex, confidence: 'fuzzy', forceBodyweight };
  return { exercise: null, confidence: 'none', forceBodyweight };
}

function cleanSuggestedName(rawName: string): string {
  return rawName
    .replace(/\s*-?\s*reps\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseWorkoutNotes(
  text: string,
  exercises: Exercise[],
  unit: WeightUnit = 'kg',
  memory: ExerciseMemory = {},
): ParsedWorkoutLine[] {
  const lines = text
    .split(/\r?\n/)
    .map(stripOuterWrapper)
    .filter(Boolean);

  const out: ParsedWorkoutLine[] = [];

  lines.forEach((rawLine, idx) => {
    const line = normalizeNoteLine(rawLine);
    const split = splitNameAndSets(line);
    if (!split) return;
    const { rawName, setsText } = split;
    const match = matchExerciseName(rawName, exercises, memory);
    const isHold = match.exercise?.default_unit === 'sec';

    // Hold ασκήσεις μετρούν δευτερόλεπτα· «15 12 10» δεν είναι βάρος 15kg.
    const defaultWeighted = match.forceBodyweight || isHold
      ? false
      : match.exercise
        ? !match.exercise.is_bodyweight || match.exercise.is_weighted
        : true;
    const sets = parseQuickSets(
      match.forceBodyweight ? `bw ${setsText}` : setsText,
      defaultWeighted,
      unit,
    );
    const looksNumeric = /\d/.test(setsText);
    if (sets.length === 0 && !looksNumeric) return;

    const cleanedName = cleanSuggestedName(rawName);
    const hasExtraContext =
      match.exercise != null &&
      normalizeExerciseText(cleanedName) !== normalizeExerciseText(match.exercise.name) &&
      cleanedName.length >= 12;

    const hasSuspectValues = sets.length === 0 || sets.some(
      (s) =>
        (s.weightKg != null && s.weightKg > SUSPECT_WEIGHT_KG) ||
        (s.reps != null && s.reps > (isHold ? SUSPECT_HOLD_SECONDS : SUSPECT_REPS)),
    );

    out.push({
      id: `line-${idx}`,
      rawLine,
      rawName,
      setsText,
      matchedExerciseId: match.exercise?.id ?? null,
      suggestedName: match.exercise?.name ?? cleanedName,
      confidence: match.confidence,
      sets,
      noteHint: hasExtraContext ? cleanedName : null,
      hasSuspectValues,
      unreadable: sets.length === 0,
      isHold,
    });
  });

  return out;
}
