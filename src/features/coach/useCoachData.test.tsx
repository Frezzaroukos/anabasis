import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { db } from '@/lib/db';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import { addSet, localDay, startWorkout } from '@/lib/db/queries';
import { setCurrentUserId } from '@/lib/db/session';
import { useCoachData } from './useCoachData';

/**
 * Deload detection διάβαζε το getVolumeTrend ανάποδα: το slice(0,7) είναι η
 * ΠΑΛΙΑ εβδομάδα (οι ημερομηνίες είναι αύξουσες), όχι η τρέχουσα. Αποτέλεσμα:
 * μια πραγματική άνοδος φαινόταν ως πτώση και το caution δεν εμφανιζόταν ποτέ.
 * Εδώ κλειδώνουμε και τις δύο κατευθύνσεις (positive + negative).
 */
const squat = SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;

beforeAll(async () => {
  await db.exercises.bulkPut(SEED_EXERCISES);
});

afterEach(() => cleanup());

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDay(d);
}

async function seedSet(weightKg: number, date: string, rpe: number | null): Promise<void> {
  const w = await startWorkout('strength', date);
  await addSet({
    workout_id: w.id,
    exercise_id: squat.id,
    weight_kg: weightKg,
    bodyweight_kg: null,
    reps: 5,
    hold_seconds: null,
    rpe,
  });
}

async function loadRisk() {
  const { result } = renderHook(() => useCoachData(true));
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result.current.deloadRisk;
}

describe('useCoachData — deload risk ordering', () => {
  it('άνοδος όγκου ≥30% με υψηλό RPE → caution (η τρέχουσα εβδομάδα είναι η νέα)', async () => {
    setCurrentUserId('coach-deload-rising');
    await seedSet(100, daysAgo(8), null); // προηγούμενη εβδομάδα: 500
    await seedSet(200, daysAgo(0), 9); // τρέχουσα: 1000, RPE 9

    const risk = await loadRisk();
    expect(risk.level).toBe('caution');
    expect(risk.reasons.some((r) => r.code === 'volume')).toBe(true);
  });

  it('πτώση όγκου με ίδιο RPE → normal (δεν αντιστρέφεται σε ψεύτικο caution)', async () => {
    setCurrentUserId('coach-deload-falling');
    await seedSet(200, daysAgo(8), null); // προηγούμενη: 1000
    await seedSet(100, daysAgo(0), 9); // τρέχουσα: 500

    const risk = await loadRisk();
    expect(risk.level).toBe('normal');
  });
});
