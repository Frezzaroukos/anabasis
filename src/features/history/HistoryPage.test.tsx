import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { HistoryPage } from './HistoryPage';
import { db } from '@/lib/db';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import { addSet, endWorkout, getRecentPRs, startWorkout } from '@/lib/db/queries';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
  await db.exercises.bulkPut(SEED_EXERCISES);
});

describe('PR detection end-to-end', () => {
  it('ένα working σετ δημιουργεί PRs· ένα warm-up όχι', async () => {
    const bench = SEED_EXERCISES.find((e) => e.name === 'Bench Press')!;
    const w = await startWorkout();

    await addSet({
      workout_id: w.id,
      exercise_id: bench.id,
      weight_kg: 80,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
    });
    const afterWorking = await getRecentPRs(50);
    expect(afterWorking.length).toBeGreaterThan(0);

    // warm-up με τερατώδες βάρος → ΔΕΝ πρέπει να γράψει PR
    const before = afterWorking.length;
    await addSet({
      workout_id: w.id,
      exercise_id: bench.id,
      weight_kg: 500,
      bodyweight_kg: null,
      reps: 20,
      hold_seconds: null,
      is_warmup: true,
    });
    expect((await getRecentPRs(50)).length).toBe(before);

    await endWorkout(w.id);
  });
});

describe('HistoryPage', () => {
  it('δείχνει ολοκληρωμένη προπόνηση και τα πρόσφατα PRs', async () => {
    render(
      <I18nextProvider i18n={i18next}>
        <MemoryRouter>
          <HistoryPage />
        </MemoryRouter>
      </I18nextProvider>,
    );
    await waitFor(() => expect(screen.getByText('Recent PRs')).toBeTruthy());
    // το όνομα άσκησης έρχεται από το exercise map
    await waitFor(() =>
      expect(screen.getAllByText('Bench Press').length).toBeGreaterThan(0),
    );
  });
});
