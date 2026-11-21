import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { setCurrentUserId } from './session';
import { getBodyMetric, getBodyTrend, localDay, saveBodyMetric } from './queries';
import { clearBodyMetric, listRecentBodyMetrics } from './workoutHelpers';
import { importBodyMetrics } from './queries';

/**
 * Περιφέρειες σώματος (Wave 4). Τα νέα cm πεδία είναι OPTIONAL/non-indexed·
 * τα παλιά rows δεν τα έχουν καθόλου. Κάθε reader πρέπει να τα βλέπει ως
 * `null` — όχι `undefined` που σπάει input value / chart.
 */
const UID = 'body-measurements-profile';

beforeEach(async () => {
  setCurrentUserId(UID);
  await db.body_metrics.clear();
});

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDay(d);
};

describe('normalize παλιών rows (χωρίς τα cm πεδία)', () => {
  it('getBodyMetric επιστρέφει null (όχι undefined) για παλιό row', async () => {
    const date = '2026-01-10';
    // Γράφουμε row ΧΕΙΡΟΚΙΝΗΤΑ χωρίς τα cm πεδία — όπως ένα προ-Wave-4 row.
    await db.body_metrics.add({
      id: 'old-row-1',
      user_id: UID,
      date,
      weight_kg: 80,
      calories_in: null,
      calories_out: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      body_fat_pct: 15,
      steps: null,
      notes: null,
      created_at: '2026-01-10T08:00:00.000Z',
      updated_at: '2026-01-10T08:00:00.000Z',
    });

    const m = await getBodyMetric(date);
    expect(m).toBeDefined();
    expect(m!.waist_cm).toBeNull();
    expect(m!.chest_cm).toBeNull();
    expect(m!.neck_cm).toBeNull();
    // Τα παλιά πεδία ανέπαφα.
    expect(m!.weight_kg).toBe(80);
  });

  it('getBodyTrend βάζει null στα cm πεδία για ημέρες χωρίς καταγραφή/παλιά rows', async () => {
    const date = daysAgo(3);
    await db.body_metrics.add({
      id: 'old-row-2',
      user_id: UID,
      date,
      weight_kg: 79,
      calories_in: null,
      calories_out: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      body_fat_pct: null,
      steps: null,
      notes: null,
      created_at: `${date}T08:00:00.000Z`,
      updated_at: `${date}T08:00:00.000Z`,
    });

    const trend = await getBodyTrend(7);
    const point = trend.find((p) => p.date === date)!;
    expect(point.waistCm).toBeNull();
    expect(point.neckCm).toBeNull();
    // Μια ημέρα χωρίς row επίσης null.
    const empty = trend.find((p) => p.weight == null && p.waistCm == null);
    expect(empty).toBeTruthy();
  });
});

describe('save / edit / delete περιφερειών', () => {
  it('αποθηκεύει περιφέρειες σε cm και τις διαβάζει πίσω', async () => {
    const date = '2026-11-01';
    await saveBodyMetric(date, {
      weight_kg: 82,
      waist_cm: 84.5,
      chest_cm: 102.5,
      neck_cm: 39,
    });
    const m = await getBodyMetric(date);
    expect(m!.waist_cm).toBe(84.5);
    expect(m!.chest_cm).toBe(102.5);
    expect(m!.neck_cm).toBe(39);
    // Τα μη-δοσμένα μένουν null.
    expect(m!.hips_cm).toBeNull();
  });

  it('edit ενημερώνει μόνο τα δοσμένα πεδία (upsert)', async () => {
    const date = '2026-11-02';
    await saveBodyMetric(date, { waist_cm: 84 });
    await saveBodyMetric(date, { waist_cm: 83, hips_cm: 96 });
    const m = await getBodyMetric(date);
    expect(m!.waist_cm).toBe(83);
    expect(m!.hips_cm).toBe(96);
  });

  it('clearBodyMetric μηδενίζει και τις περιφέρειες', async () => {
    const date = '2026-11-03';
    await saveBodyMetric(date, { weight_kg: 80, waist_cm: 85, neck_cm: 40 });
    await clearBodyMetric(date);
    const m = await getBodyMetric(date);
    // Row υπάρχει αλλά όλες οι τιμές άδειες (soft-clear).
    expect(m?.weight_kg ?? null).toBeNull();
    expect(m?.waist_cm ?? null).toBeNull();
    expect(m?.neck_cm ?? null).toBeNull();
  });

  it('listRecentBodyMetrics περιλαμβάνει μέρα με ΜΟΝΟ περιφέρεια', async () => {
    const date = '2026-11-04';
    await saveBodyMetric(date, { waist_cm: 86 });
    const recent = await listRecentBodyMetrics(10);
    expect(recent.some((r) => r.date === date && r.waist_cm === 86)).toBe(true);
  });

  it('importBodyMetrics: νέο row παίρνει null cm defaults, patch με cm περνά', async () => {
    const date = '2026-11-05';
    await importBodyMetrics([{ date, patch: { waist_cm: 88 } }]);
    const m = await getBodyMetric(date);
    expect(m!.waist_cm).toBe(88);
    expect(m!.neck_cm).toBeNull();
  });
});

describe('getBodyTrend — σειρά περιφερειών για chart (0/1/N σημεία)', () => {
  it('0 σημεία: όλα null σε όλο το εύρος', async () => {
    const trend = await getBodyTrend(5);
    expect(trend.length).toBe(5);
    expect(trend.every((p) => p.waistCm == null)).toBe(true);
  });

  it('1 σημείο: μόνο εκείνη η μέρα έχει τιμή', async () => {
    const date = daysAgo(2);
    await saveBodyMetric(date, { waist_cm: 82 });
    const trend = await getBodyTrend(5);
    const withValue = trend.filter((p) => p.waistCm != null);
    expect(withValue).toHaveLength(1);
    expect(withValue[0]!.date).toBe(date);
  });

  it('N σημεία: χρονολογική σειρά, κενές μέρες null (όχι εφευρημένες τιμές)', async () => {
    await saveBodyMetric(daysAgo(4), { waist_cm: 84 });
    await saveBodyMetric(daysAgo(2), { waist_cm: 83 });
    await saveBodyMetric(daysAgo(0), { waist_cm: 82 });
    const trend = await getBodyTrend(6);
    const values = trend.filter((p) => p.waistCm != null).map((p) => p.waistCm);
    expect(values).toEqual([84, 83, 82]);
    // Μια κενή μέρα ανάμεσα παραμένει null.
    const gaps = trend.filter((p) => p.waistCm == null).length;
    expect(gaps).toBeGreaterThan(0);
  });
});
