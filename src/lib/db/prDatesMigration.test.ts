import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './index';
import { SEED_EXERCISES } from './seeds';
import { addSet, startWorkout } from './queries';
import { getCurrentUserId, setCurrentUserId } from './session';
import { PR_DATES_FLAG_PREFIX, runPRDatesMigration, schedulePRDatesMigration } from './prDatesMigration';

const UID = 'pr-migration-profile';

// Το vitest/node δεν δίνει λειτουργικό localStorage — in-memory stub.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});
const dips = SEED_EXERCISES.find((e) => e.name === 'Dips')!;

function dayStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const localDayOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('pr-dates-v1 migration', () => {
  let original: string;
  beforeAll(async () => {
    original = getCurrentUserId();
    setCurrentUserId(UID);
    await db.exercises.bulkPut(SEED_EXERCISES);
  });
  afterAll(() => setCurrentUserId(original));
  beforeEach(() => {
    localStorage.removeItem(`${PR_DATES_FLAG_PREFIX}${UID}`);
    vi.restoreAllMocks();
  });

  it('PR «σήμερα» για προπόνηση 10 μέρες πίσω → σωστή ημερομηνία· 2η εκτέλεση = skipped', async () => {
    const w = await startWorkout('strength', dayStr(10));
    await addSet({ workout_id: w.id, exercise_id: dips.id, weight_kg: 25, bodyweight_kg: null, reps: 5, hold_seconds: null });
    // προσομοίωση παλιού bug: όλα τα PR της άσκησης γραμμένα «τώρα»
    const nowIso = new Date().toISOString();
    const prs = await db.personal_records.where('exercise_id').equals(dips.id).toArray();
    expect(prs.length).toBeGreaterThan(0);
    for (const pr of prs) await db.personal_records.update(pr.id, { achieved_at: nowIso });

    const res = await runPRDatesMigration();
    expect(res.status).toBe('done');
    expect(res.status === 'done' && res.fixed).toBeGreaterThan(0);
    const after = (await db.personal_records.where('exercise_id').equals(dips.id).toArray()).filter(
      (r) => r.deleted_at == null,
    );
    expect(after.length).toBeGreaterThan(0);
    for (const pr of after) expect(localDayOf(pr.achieved_at)).toBe(dayStr(10));

    expect((await runPRDatesMigration()).status).toBe('skipped');
  });

  it('idempotent: χωρίς σημαία, δεύτερο τρέξιμο δεν αλλάζει τίποτα (fixed = 0)', async () => {
    const first = await runPRDatesMigration();
    expect(first.status).toBe('done');
    localStorage.removeItem(`${PR_DATES_FLAG_PREFIX}${UID}`);
    const second = await runPRDatesMigration();
    expect(second).toEqual({ status: 'done', fixed: 0 });
  });

  it('χωρίς ζωντανά σετ δεν πειράζει τίποτα (ορφανό PR μένει)', async () => {
    setCurrentUserId('pr-migration-empty');
    const t = new Date().toISOString();
    await db.personal_records.add({
      id: 'orphan-pr', user_id: 'pr-migration-empty', exercise_id: dips.id, activity_kind: null,
      type: 'max_reps', value: 9, reps: 9, weight_kg: null, achieved_at: t, workout_id: 'gone',
      set_id: null, created_at: t, updated_at: t,
    });
    const res = await runPRDatesMigration();
    expect(res).toEqual({ status: 'done', fixed: 0 });
    const row = await db.personal_records.get('orphan-pr');
    expect(row!.deleted_at ?? null).toBeNull();
    expect(row!.achieved_at).toBe(t);
    setCurrentUserId(UID);
  });

  it('αποτυχία δεν σημαδεύει τη σημαία', async () => {
    const spy = vi.spyOn(db.workouts, 'where').mockImplementation(() => {
      throw new Error('boom');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await runPRDatesMigration();
    spy.mockRestore();
    expect(res.status).toBe('failed');
    expect(localStorage.getItem(`${PR_DATES_FLAG_PREFIX}${UID}`)).toBeNull();
  });

  it('περιμένει το sync πριν τρέξει', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    schedulePRDatesMigration(() => gate);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(localStorage.getItem(`${PR_DATES_FLAG_PREFIX}${UID}`)).toBeNull();
    release();
    await vi.advanceTimersByTimeAsync(20_000);
    vi.useRealTimers();
    await vi.waitFor(() => expect(localStorage.getItem(`${PR_DATES_FLAG_PREFIX}${UID}`)).toBe('1'));
  });
});
