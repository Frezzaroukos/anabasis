/**
 * Parser για το CSV export του Hevy.
 *
 * Στήλες (comma-separated): title,start_time,end_time,description,
 * exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,
 * reps,distance_km,duration_seconds,rpe
 *
 * Ιδιαιτερότητες που μας νοιάζουν:
 *  - start_time σε μορφή «22 Dec 2025, 08:00» (τοπική ώρα) — παλιότερα
 *    exports είχαν και ISO-like, οπότε δεχόμαστε και τα δύο,
 *  - weight_kg ΠΑΝΤΑ σε κιλά (καμία μετατροπή),
 *  - set_type: normal/warmup/failure/dropset — χαρτογραφείται στα δικά μας.
 * Παλιότερα exports με «weight»+«weight_unit» καλύπτονται κι αυτά.
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

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** «22 Dec 2025, 08:00» ή «2025-12-22 08:00:00» → Date (τοπική ώρα). */
function parseHevyDate(s: string): Date | null {
  const t = s.trim();
  const m1 = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/);
  if (m1) {
    const month = MONTHS[m1[2]!.toLowerCase()];
    if (month == null) return null;
    const d = new Date(Number(m1[3]), month, Number(m1[1]), Number(m1[4]), Number(m1[5]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m2 = t.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m2) {
    const d = new Date(
      Number(m2[1]),
      Number(m2[2]) - 1,
      Number(m2[3]),
      Number(m2[4]),
      Number(m2[5]),
      Number(m2[6] ?? 0),
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function parseHevyCsv(text: string): WorkoutParseResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { workouts: [], badRows: [] };

  const h = headerIndex(rows[0]!);
  const col = (name: string) => h.get(name);
  const iTitle = col('title');
  const iStart = col('start time');
  const iEnd = col('end time');
  const iDescription = col('description');
  const iExercise = col('exercise title') ?? col('exercise name');
  const iExerciseNotes = col('exercise notes');
  const iSetType = col('set type');
  const iWeightKg = col('weight kg');
  const iWeight = col('weight');
  const iWeightUnit = col('weight unit');
  const iReps = col('reps');
  const iDuration = col('duration seconds');
  const iRpe = col('rpe');

  if (iStart == null || iExercise == null) {
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

    const started = parseHevyDate(cell(iStart) ?? '');
    const exerciseName = (cell(iExercise) ?? '').trim();
    if (!started || !exerciseName) {
      badRows.push({ line: r + 1, reason: !started ? 'bad-date' : 'no-exercise', raw });
      continue;
    }

    let weightKg = parseNum(cell(iWeightKg));
    if (weightKg == null && iWeight != null) {
      // παλιό format: «weight» + «weight_unit» — μόνο εδώ χωράει μετατροπή
      weightKg = parseNum(cell(iWeight));
      const unit = (cell(iWeightUnit) ?? '').trim().toLowerCase();
      if (weightKg != null && (unit === 'lb' || unit === 'lbs')) {
        weightKg = Math.round(weightKg * LB_TO_KG * 100) / 100;
      }
    }
    const reps = nonZero(parsePosInt(cell(iReps)));
    const holdSeconds = nonZero(parsePosInt(cell(iDuration)));

    // Weight 0 μόνο του = κενό πεδίο export, όχι σετ· με reps = bodyweight σετ
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

    const setTypeRaw = (cell(iSetType) ?? 'normal').trim().toLowerCase();
    const isWarmup = setTypeRaw === 'warmup';
    const isFailure = setTypeRaw === 'failure';
    // dropset κ.λπ. περνάνε αυτούσια — το SetType μας είναι ελεύθερο string
    const setType = setTypeRaw === '' ? 'normal' : setTypeRaw;

    const workoutKey = `${cell(iStart)}|${cell(iTitle) ?? ''}`;
    let w = workouts.get(workoutKey);
    if (!w) {
      const ended = parseHevyDate(cell(iEnd) ?? '');
      const durationSeconds =
        ended && ended.getTime() > started.getTime()
          ? Math.round((ended.getTime() - started.getTime()) / 1000)
          : null;
      w = {
        key: `hevy-${workouts.size}`,
        date: toLocalDay(started),
        startedAtIso: started.toISOString(),
        durationSeconds,
        name: (cell(iTitle) ?? '').trim() || null,
        notes: (cell(iDescription) ?? '').trim() || null,
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
      // set_index του Hevy είναι 0-based· κρατάμε δικό μας 1-based sequence
      // ώστε να ταιριάζει με ό,τι θα έγραφε το addSet
      setNumber: ex.sets.length + 1,
      weightKg,
      reps,
      holdSeconds,
      rpe,
      isWarmup,
      isFailure,
      setType,
      notes: (cell(iExerciseNotes) ?? '').trim() || null,
      suspect,
      suspectReason,
      raw,
    };
    ex.sets.push(set);
  }

  return { workouts: [...workouts.values()], badRows };
}
