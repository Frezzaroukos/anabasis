/**
 * Parser για το CSV export του Strong app.
 *
 * Δύο γνωστές παραλλαγές στη φύση:
 *  - iOS (comma): Date,Workout Name,Duration,Exercise Name,Set Order,
 *    Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
 *  - Android (semicolon): ίδιες στήλες συν «Weight Unit»/«Distance Unit»
 *    και «Workout Duration» αντί για «Duration».
 *
 * Γι' αυτό: delimiter sniffing, header lookup με ονόματα (όχι θέσεις), και
 * μετατροπή lbs→kg όταν υπάρχει unit στήλη. Ό,τι δεν βγάζει νόημα δεν
 * πετιέται σιωπηλά — γίνεται badRow ή suspect set για το preview.
 */

import { headerIndex, parseCsv } from './csv';
import {
  nonZero,
  parseNum,
  parsePosInt,
  toLocalDay,
  type ImportedSet,
  type ImportedWorkout,
  type WorkoutParseResult,
} from './types';

const LB_TO_KG = 0.45359237;

/** «2025-01-15 17:45:32» (τοπική ώρα) → Date, ή null αν δεν είναι ημερομηνία. */
function parseStrongDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? 0),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

/** «1h 30m», «45m», «1h 2m 30s» → δευτερόλεπτα. */
function parseDuration(s: string | undefined): number | null {
  if (!s) return null;
  let total = 0;
  let found = false;
  for (const m of s.matchAll(/(\d+)\s*(h|hr|m|min|s|sec)\b/gi)) {
    const n = Number(m[1]);
    const unit = m[2]!.toLowerCase();
    total += unit.startsWith('h') ? n * 3600 : unit.startsWith('m') ? n * 60 : n;
    found = true;
  }
  return found ? total : null;
}

export function parseStrongCsv(text: string): WorkoutParseResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { workouts: [], badRows: [] };

  const h = headerIndex(rows[0]!);
  const col = (name: string) => h.get(name);
  const iDate = col('date');
  const iExercise = col('exercise name');
  const iSetOrder = col('set order');
  const iWeight = col('weight');
  const iWeightUnit = col('weight unit');
  const iReps = col('reps');
  const iSeconds = col('seconds');
  const iRpe = col('rpe');
  const iName = col('workout name');
  const iNotes = col('notes');
  const iWorkoutNotes = col('workout notes');
  const iDuration = col('duration') ?? col('workout duration');

  // Χωρίς αυτά δεν είναι Strong export — καλύτερα κανένα αποτέλεσμα με μήνυμα
  // παρά ένα «πέτυχε» που διάβασε σκουπίδια.
  if (iDate == null || iExercise == null) {
    return {
      workouts: [],
      badRows: [{ line: 1, reason: 'missing-columns', raw: rows[0]!.join(',').slice(0, 120) }],
    };
  }

  const workouts = new Map<string, ImportedWorkout>();
  const badRows: WorkoutParseResult['badRows'] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const raw = row.join(', ').slice(0, 120);
    const cell = (i: number | undefined) => (i == null ? undefined : row[i]);

    const started = parseStrongDate(cell(iDate) ?? '');
    const exerciseName = (cell(iExercise) ?? '').trim();
    if (!started || !exerciseName) {
      badRows.push({ line: r + 1, reason: !started ? 'bad-date' : 'no-exercise', raw });
      continue;
    }

    let weightKg = parseNum(cell(iWeight));
    const unit = (cell(iWeightUnit) ?? '').trim().toLowerCase();
    if (weightKg != null && (unit === 'lb' || unit === 'lbs')) {
      // στρογγυλοποίηση 2 δεκαδικών ώστε το ίδιο αρχείο να δίνει ΠΑΝΤΑ την
      // ίδια τιμή — πάνω της πατάει το duplicate-detection στο merge
      weightKg = Math.round(weightKg * LB_TO_KG * 100) / 100;
    }
    const reps = nonZero(parsePosInt(cell(iReps)));
    const holdSeconds = nonZero(parsePosInt(cell(iSeconds)));

    // γραμμή χωρίς καμία μέτρηση δεν είναι σετ — Weight 0 μόνο του δεν
    // αρκεί (τα exports γράφουν 0 στα κενά πεδία), αλλά ΜΕ reps σημαίνει
    // «σκέτο σωματικό βάρος» και κρατιέται
    if ((weightKg == null || weightKg === 0) && reps == null && holdSeconds == null) {
      badRows.push({ line: r + 1, reason: 'empty-set', raw });
      continue;
    }

    let rpe = nonZero(parseNum(cell(iRpe)));
    let suspect = false;
    let suspectReason: string | null = null;
    if (rpe != null && (rpe < 1 || rpe > 10)) {
      rpe = null;
      suspect = true;
      suspectReason = 'rpe-out-of-range';
    }
    if (weightKg != null && (weightKg < 0 || weightKg > 600)) {
      suspect = true;
      suspectReason = 'weight-implausible';
    }

    // Set Order: αριθμός, ή «W»/«W1» για warmup, «F» για failure
    const orderRaw = (cell(iSetOrder) ?? '').trim();
    const isWarmup = /^w/i.test(orderRaw);
    const isFailure = /^f$/i.test(orderRaw);

    const workoutKey = `${cell(iDate)}|${cell(iName) ?? ''}`;
    let w = workouts.get(workoutKey);
    if (!w) {
      w = {
        key: `strong-${workouts.size}`,
        date: toLocalDay(started),
        startedAtIso: started.toISOString(),
        durationSeconds: parseDuration(cell(iDuration)),
        name: (cell(iName) ?? '').trim() || null,
        notes: (cell(iWorkoutNotes) ?? '').trim() || null,
        exercises: [],
      };
      workouts.set(workoutKey, w);
    }

    let ex = w.exercises.find((e) => e.name === exerciseName);
    if (!ex) {
      ex = { name: exerciseName, sets: [] };
      w.exercises.push(ex);
    }
    const set: ImportedSet = {
      // δικό μας sequential number — το «Set Order» του Strong ξαναρχίζει
      // ανά άσκηση αλλά μπορεί να έχει W/F, οπότε δεν είναι αξιόπιστο index
      setNumber: ex.sets.length + 1,
      weightKg,
      reps,
      holdSeconds,
      rpe,
      isWarmup,
      isFailure,
      setType: isWarmup ? 'warmup' : isFailure ? 'failure' : 'normal',
      notes: (cell(iNotes) ?? '').trim() || null,
      suspect,
      suspectReason,
      raw,
    };
    ex.sets.push(set);
  }

  return { workouts: [...workouts.values()], badRows };
}
