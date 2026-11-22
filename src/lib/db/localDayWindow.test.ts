import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from './index';
import { SEED_EXERCISES } from './seeds';
import { addSet, getExerciseProgress, localDay, localDayDaysBack, startWorkout } from './queries';
import { getCurrentUserId, setCurrentUserId } from './session';

// Το app tsconfig δεν έχει @types/node — τοπική δήλωση για το env.
const proc = process as unknown as { env: Record<string, string | undefined> };
const ORIGINAL_TZ = proc.env.TZ;

describe('ημερολογιακό παράθυρο «τελευταίες N μέρες» (X-audit #16)', () => {
  let original: string;
  const dips = SEED_EXERCISES.find((e) => e.name === 'Dips')!;

  beforeAll(async () => {
    proc.env.TZ = 'Europe/Athens';
    original = getCurrentUserId();
    setCurrentUserId('local-day-window-profile');
    await db.exercises.bulkPut(SEED_EXERCISES);
  });
  afterAll(() => {
    if (ORIGINAL_TZ === undefined) delete proc.env.TZ;
    else proc.env.TZ = ORIGINAL_TZ;
    setCurrentUserId(original);
  });

  it('localDayDaysBack: τοπικές μέρες, σωστό και πάνω από αλλαγή ώρας', () => {
    // 22 Νοε 08:00 τοπική
    expect(localDayDaysBack(180, new Date(2026, 10, 22, 8, 0))).toBe('2026-05-26');
    expect(localDayDaysBack(0, new Date(2026, 10, 22, 8, 0))).toBe('2026-11-22');
    // πάνω από DST (τέλος Οκτ): 30 μέρες πίσω από 5 Νοε
    expect(localDayDaysBack(30, new Date(2026, 10, 5, 0, 30))).toBe('2026-10-06');
  });

  it('προπόνηση το πρωί της οριακής μέρας ΜΠΑΙΝΕΙ· η μέρα πριν το όριο όχι', async () => {
    const boundary = localDayDaysBack(180);
    const before = localDayDaysBack(181);
    const mk = async (day: string, hour: number) => {
      const w = await startWorkout('strength', day);
      const d = new Date(`${day}T00:00:00`);
      d.setHours(hour, 0, 0, 0); // 07:00 τοπική — πριν το (now − 180×24h) αν τώρα > 07:00
      await db.workouts.update(w.id, { started_at: d.toISOString() });
      await addSet({ workout_id: w.id, exercise_id: dips.id, weight_kg: 10, bodyweight_kg: null, reps: 5, hold_seconds: null });
      return w;
    };
    await mk(boundary, 0);
    await mk(before, 12);
    const pts = await getExerciseProgress(dips.id, 180);
    expect(pts.map((p) => p.date)).toContain(boundary);
    expect(pts.map((p) => p.date)).not.toContain(before);
  });

  it('ladder chart: 01:30 τοπική ΔΕΝ είναι η χθεσινή μέρα (localDay vs ISO slice)', () => {
    const iso = new Date(2026, 10, 22, 1, 30).toISOString(); // 2026-11-21T23:30Z
    expect(iso.slice(0, 10)).toBe('2026-11-21');
    expect(localDay(new Date(iso))).toBe('2026-11-22');
  });
});
