/**
 * Προγραμματισμένες προπονήσεις (planner) — CRUD + «Ξεκίνα».
 *
 * Ξεχωριστό αρχείο από το `schedule.ts` (που αφορά την επόμενη μέρα ενός
 * προγράμματος) και από το `queries.ts` (όριο oxc parser). Όλες οι εγγραφές
 * περνούν από εδώ· τα components δεν αγγίζουν `db.scheduled_sessions`.
 *
 * Οι ημερομηνίες είναι ΠΑΝΤΑ τοπικές `YYYY-MM-DD`. Το «Ξεκίνα» δανείζεται τις
 * υπάρχουσες start συναρτήσεις (program day / flat program / ad-hoc), ώστε το
 * planned row να μη δημιουργεί δεύτερο, διαφορετικό τρόπο εκκίνησης.
 */

import { v4 as uuid } from 'uuid';
import { db } from './index';
import { getCurrentUserId } from './session';
import {
  localDay,
  startAdHocWorkout,
  startWorkoutFromProgram,
  startWorkoutFromProgramDay,
} from './queries';
import type {
  ActivityKind,
  ScheduledSession,
  ScheduledSessionStatus,
} from './types';

const now = () => new Date().toISOString();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ScheduledSessionInput {
  /** Τοπική ημερομηνία YYYY-MM-DD. */
  date: string;
  /** HH:MM ή null. */
  time?: string | null;
  title: string;
  program_id?: string | null;
  program_day_id?: string | null;
  activity_kind?: ActivityKind | null;
  notes?: string | null;
}

export type ScheduledSessionPatch = Partial<
  Pick<
    ScheduledSession,
    | 'date'
    | 'time'
    | 'title'
    | 'program_id'
    | 'program_day_id'
    | 'activity_kind'
    | 'notes'
    | 'status'
  >
>;

function assertDate(date: string): string {
  if (!DATE_RE.test(date)) throw new Error(`invalid date: ${date}`);
  return date;
}

function normalizeTitle(title: string): string {
  const value = title.trim();
  if (!value) throw new Error('scheduled session title is required');
  return value;
}

function normalizeTime(time: string | null | undefined): string | null {
  if (time == null) return null;
  const value = time.trim().slice(0, 5);
  return value === '' ? null : value;
}

/**
 * Οι ημερομηνίες μιας εβδομαδιαίας επανάληψης (ίδια μέρα/ώρα, +7 μέρες).
 * Clamp 1..52 ώστε ένα λάθος input να μη γράψει χιλιάδες rows.
 */
export function weeklyDates(startDate: string, weeks: number): string[] {
  assertDate(startDate);
  const count = Math.min(52, Math.max(1, Math.floor(weeks)));
  const [y, m, d] = startDate.split('-').map(Number);
  return Array.from({ length: count }, (_, i) =>
    localDay(new Date(y!, m! - 1, d! + i * 7)),
  );
}

function buildScheduledRow(input: ScheduledSessionInput): ScheduledSession {
  const t = now();
  return {
    id: uuid(),
    user_id: getCurrentUserId(),
    date: assertDate(input.date),
    time: normalizeTime(input.time),
    title: normalizeTitle(input.title),
    program_id: input.program_id ?? null,
    program_day_id: input.program_day_id ?? null,
    activity_kind: input.activity_kind ?? null,
    notes: input.notes?.trim() || null,
    status: 'planned',
    workout_id: null,
    created_at: t,
    updated_at: t,
    deleted_at: null,
  };
}

export async function createScheduledSession(
  input: ScheduledSessionInput,
): Promise<ScheduledSession> {
  const row = buildScheduledRow(input);
  await db.scheduled_sessions.add(row);
  return row;
}

/**
 * Δημιουργεί την ίδια προπόνηση κάθε εβδομάδα για `weeks` εβδομάδες.
 *
 * Χτίζει ΟΛΕΣ τις γραμμές πριν γράψει και τις βάζει σε ΜΙΑ transaction:
 * αλλιώς ένα abort στη μέση άφηνε μισοδημιουργημένη σειρά (π.χ. 6 από 12
 * εβδομάδες) που ο χρήστης δεν μπορούσε να ξεχωρίσει από πλήρη.
 */
export async function createRecurringScheduledSessions(
  input: ScheduledSessionInput,
  weeks: number,
): Promise<ScheduledSession[]> {
  const rows = weeklyDates(input.date, weeks).map((date) =>
    buildScheduledRow({ ...input, date }),
  );
  await db.transaction('rw', db.scheduled_sessions, async () => {
    await db.scheduled_sessions.bulkAdd(rows);
  });
  return rows;
}

export async function updateScheduledSession(
  id: string,
  patch: ScheduledSessionPatch,
): Promise<void> {
  const row: Partial<ScheduledSession> = { updated_at: now() };
  if (patch.date !== undefined) row.date = assertDate(patch.date);
  if (patch.time !== undefined) row.time = normalizeTime(patch.time);
  if (patch.title !== undefined) row.title = normalizeTitle(patch.title);
  if (patch.program_id !== undefined) row.program_id = patch.program_id;
  if (patch.program_day_id !== undefined) row.program_day_id = patch.program_day_id;
  if (patch.activity_kind !== undefined) row.activity_kind = patch.activity_kind;
  if (patch.notes !== undefined) row.notes = patch.notes?.trim() || null;
  if (patch.status !== undefined) row.status = patch.status;
  await db.scheduled_sessions.update(id, row);
}

/** Soft delete — το sync βλέπει tombstone, τίποτα δεν χάνεται βίαια. */
export async function deleteScheduledSession(id: string): Promise<void> {
  const t = now();
  await db.scheduled_sessions.update(id, { deleted_at: t, updated_at: t });
}

export async function setScheduledSessionStatus(
  id: string,
  status: ScheduledSessionStatus,
): Promise<void> {
  await db.scheduled_sessions.update(id, { status, updated_at: now() });
}

function sortSessions(rows: ScheduledSession[]): ScheduledSession[] {
  return rows
    .filter((s) => s.deleted_at == null)
    .sort(
      (a, b) =>
        `${a.date} ${a.time ?? '99:99'}`.localeCompare(`${b.date} ${b.time ?? '99:99'}`) ||
        a.created_at.localeCompare(b.created_at),
    );
}

/** Όλες οι ΖΩΝΤΑΝΕΣ προγραμματισμένες ημέρες στο κλειστό εύρος [from, to]. */
export async function listScheduledSessions(
  from: string,
  to: string,
): Promise<ScheduledSession[]> {
  const uid = getCurrentUserId();
  const rows = await db.scheduled_sessions
    .where('[user_id+date]')
    .between([uid, from], [uid, to], true, true)
    .toArray();
  return sortSessions(rows);
}

export async function listScheduledForDay(date: string): Promise<ScheduledSession[]> {
  return listScheduledSessions(date, date);
}

/**
 * «Ξεκίνα»: δημιουργεί το πραγματικό workout από το πρόγραμμα/μέρα που είχε
 * επιλεγεί (ή ad-hoc) και συνδέει το planned row με αυτό. Το status μένει
 * `planned` μέχρι το `endWorkout` — τότε γίνεται `done` (βλ.
 * scheduledSessionLinks.ts). Επιστρέφει `null` αν υπάρχει ήδη ενεργή
 * προπόνηση, αν η ημερομηνία είναι μελλοντική, ή αν το session έχει ολοκληρωθεί.
 */
export async function startScheduledSession(
  session: Pick<
    ScheduledSession,
    | 'id'
    | 'date'
    | 'status'
    | 'program_id'
    | 'program_day_id'
    | 'activity_kind'
    | 'title'
    | 'workout_id'
    | 'deleted_at'
  >,
): Promise<{ workoutId: string } | null> {
  if (session.deleted_at != null) return null;
  if (session.date > localDay()) return null;
  if (session.status === 'done') return null;

  // Αν είχε ήδη ξεκινήσει και το workout είναι ακόμη ενεργό, ξαναάνοιξέ το
  // αντί να δημιουργήσεις δεύτερο.
  if (session.workout_id) {
    const existing = await db.workouts.get(session.workout_id);
    if (existing && existing.deleted_at == null && existing.ended_at == null) {
      return { workoutId: existing.id };
    }
  }

  const onDate = session.date === localDay() ? undefined : session.date;
  let workoutId: string | null = null;

  if (session.program_day_id) {
    const res = await startWorkoutFromProgramDay(session.program_day_id, onDate);
    workoutId = res?.workout.id ?? null;
  } else if (session.program_id) {
    const res = await startWorkoutFromProgram(session.program_id, onDate);
    workoutId = res?.workout.id ?? null;
  } else {
    const res = await startAdHocWorkout(
      session.activity_kind ?? 'strength',
      onDate,
      session.title,
    );
    workoutId = res?.workout.id ?? null;
  }

  if (!workoutId) return null;
  await db.scheduled_sessions.update(session.id, {
    workout_id: workoutId,
    updated_at: now(),
  });
  return { workoutId };
}
