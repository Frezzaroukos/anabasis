/**
 * One-time διόρθωση ήδη αποθηκευμένων PR με λάθος `achieved_at`.
 *
 * Πριν από το fix «PR ακολουθεί τη μέρα της προπόνησης», PR από backdated /
 * εισαγμένες / μετακινημένες προπονήσεις γράφτηκαν με την ώρα του import ή της
 * καταχώρισης. Το `recomputePRsForExercise` διορθώνει πλέον το achieved_at στη
 * θέση του (ίδιο id) — εδώ το τρέχουμε ΜΙΑ φορά ανά προφίλ για ΟΛΕΣ τις
 * ασκήσεις και τα activity PRs. Χωρίς schema bump· η σημαία ζει σε localStorage.
 *
 * Idempotent (το recompute είναι), και αν αποτύχει δεν σημαδεύουμε τη σημαία →
 * ξαναδοκιμάζει στο επόμενο boot.
 */
import { db } from './schema';
import { getCurrentUserId } from './session';
import { recomputeActivityPRs, recomputePRsForExercise } from './queries';

export const PR_DATES_FLAG_PREFIX = 'anabasis:pr-dates-v1:';

function flagKey(uid: string): string {
  return `${PR_DATES_FLAG_PREFIX}${uid}`;
}

function isDone(uid: string): boolean {
  try {
    return globalThis.localStorage?.getItem(flagKey(uid)) === '1';
  } catch {
    return false;
  }
}

function markDone(uid: string): void {
  try {
    globalThis.localStorage?.setItem(flagKey(uid), '1');
  } catch {
    /* χωρίς storage ξανατρέχει στο επόμενο boot — ακίνδυνο (idempotent) */
  }
}

async function snapshotLivePRs(uid: string): Promise<Map<string, string>> {
  const rows = await db.personal_records.where('user_id').equals(uid).toArray();
  return new Map(rows.filter((r) => r.deleted_at == null).map((r) => [r.id, r.achieved_at]));
}

export type PRDatesMigrationResult =
  | { status: 'skipped' }
  | { status: 'done'; fixed: number }
  | { status: 'failed' };

/** `fixed` = PR rows που άλλαξαν ημερομηνία, προστέθηκαν ή αντικαταστάθηκαν. */
export async function runPRDatesMigration(): Promise<PRDatesMigrationResult> {
  const uid = getCurrentUserId();
  if (isDone(uid)) return { status: 'skipped' };
  try {
    const before = await snapshotLivePRs(uid);

    const workouts = (await db.workouts.where('user_id').equals(uid).toArray()).filter(
      (w) => w.deleted_at == null,
    );
    const exerciseIds = new Set<string>();
    if (workouts.length > 0) {
      const sets = await db.sets
        .where('workout_id')
        .anyOf(workouts.map((w) => w.id))
        .toArray();
      for (const s of sets) if (s.deleted_at == null) exerciseIds.add(s.exercise_id);
    }
    const activityKinds = new Set(workouts.map((w) => w.activity_kind));

    for (const exerciseId of exerciseIds) {
      // Αλλαγή προφίλ στη μέση = μην γράψεις στο λάθος προφίλ.
      if (getCurrentUserId() !== uid) return { status: 'failed' };
      await recomputePRsForExercise(exerciseId);
    }
    for (const kind of activityKinds) {
      if (getCurrentUserId() !== uid) return { status: 'failed' };
      await recomputeActivityPRs(kind);
    }

    const after = await snapshotLivePRs(uid);
    let fixed = 0;
    for (const [id, at] of after) if (before.get(id) !== at) fixed += 1;
    for (const id of before.keys()) if (!after.has(id)) fixed += 1;
    markDone(uid);
    console.info(`[migration] pr-dates-v1: ${fixed} PR rows fixed`);
    return { status: 'done', fixed };
  } catch (err) {
    console.warn('[migration] pr-dates-v1 failed — will retry next boot', err);
    return { status: 'failed' };
  }
}

/**
 * Προγραμματίζει το migration σε idle ΑΦΟΥ ολοκληρωθεί το πρώτο sync (αν
 * υπάρχει λογαριασμός). `waitForSync` το δίνει ο caller (βλ. App.tsx) ώστε
 * αυτό το module να μένει ανεξάρτητο από το sync engine.
 */
export function schedulePRDatesMigration(waitForSync: () => Promise<void>): void {
  void waitForSync().then(() => {
    const run = () => void runPRDatesMigration();
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    if (ric) ric(run, { timeout: 10_000 });
    else setTimeout(run, 3000);
  });
}
