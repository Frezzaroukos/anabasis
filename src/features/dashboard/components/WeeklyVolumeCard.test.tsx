import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { addSet, endWorkout, localDay, startWorkout } from '@/lib/db/queries';
import { WeeklyVolumeCard } from './WeeklyVolumeCard';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
});

beforeEach(async () => {
  setCurrentUserId('weekly-volume-card');
  await db.workouts.clear();
  await db.sets.clear();
});

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDay(d);
}

async function seedVolume(date: string | undefined, weightKg: number): Promise<void> {
  const w = await startWorkout('strength', date);
  await addSet({
    workout_id: w.id,
    exercise_id: 'ex-00000000-0000-4000-8000-000000000001',
    weight_kg: weightKg,
    bodyweight_kg: null,
    reps: 10,
    hold_seconds: null,
  });
  await endWorkout(w.id);
}

const wrap = (ui: React.ReactNode) => <I18nextProvider i18n={i18next}>{ui}</I18nextProvider>;

/**
 * Το label έλεγε «εβδομάδα» αλλά ο υπολογισμός είναι ΚΥΛΙΟΜΕΝΟ 7ήμερο. Εδώ
 * κλειδώνουμε ότι το κείμενο λέει ρητά «last/previous 7 days» και ότι τα
 * νούμερα παραμένουν σωστά (2000 vs 1000 → +100%).
 */
describe('WeeklyVolumeCard — rolling 7-day wording', () => {
  it('δείχνει «last 7 days» / «previous 7 days», όχι «this week»', async () => {
    await seedVolume(daysAgo(8), 100); // 100 × 10 = 1000 (previous 7)
    await seedVolume(undefined, 200); // 200 × 10 = 2000 (last 7)

    const { container } = render(wrap(<WeeklyVolumeCard />));

    await waitFor(() => expect(screen.getByText('Last 7 days')).toBeTruthy());
    const text = container.textContent ?? '';
    expect(text).toContain('previous 7 days: 1k kg');
    expect(text).toContain('2k kg · last 7 days');
    expect(text).toContain('+100%');
    expect(text).not.toContain('this week');
    expect(text).not.toContain('vs last week');
  });
});
