import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { HistoryPage } from './HistoryPage';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import { addSet, endWorkout, startWorkout } from '@/lib/db/queries';

/**
 * Φίλτρα/αναζήτηση/ομαδοποίηση ιστορικού (lane A-detail).
 */
const UID = 'history-filters-profile';
const bench = SEED_EXERCISES.find((e) => e.name === 'Bench Press')!;
const squat = SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;

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
  setCurrentUserId(UID);
  await db.exercises.clear();
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.workouts.clear();
  await db.sets.clear();
  await db.personal_records.clear();
});

async function seed() {
  const w1 = await startWorkout('strength', '2026-11-10', null, null, 'Push A');
  await addSet({ workout_id: w1.id, exercise_id: bench.id, weight_kg: 80, bodyweight_kg: null, reps: 5, hold_seconds: null });
  await endWorkout(w1.id);

  const w2 = await startWorkout('strength', '2026-11-12', null, null, 'Legs');
  await addSet({ workout_id: w2.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null });
  await endWorkout(w2.id);
}

const renderPage = () =>
  render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    </I18nextProvider>,
  );

describe('HistoryPage — φίλτρα & ομαδοποίηση', () => {
  it('φιλτράρει με αναζήτηση (κείμενο) και εμφανίζει no-results όταν δεν ταιριάζει', async () => {
    await seed();
    renderPage();
    await waitFor(() => expect(screen.getByText('Push A')).toBeTruthy());
    expect(screen.getByText('Legs')).toBeTruthy();

    const search = screen.getByLabelText('Search history…');
    fireEvent.change(search, { target: { value: 'legs' } });
    await waitFor(() => expect(screen.queryByText('Push A')).toBeNull());
    expect(screen.getByText('Legs')).toBeTruthy();

    fireEvent.change(search, { target: { value: 'zzzz' } });
    await waitFor(() => expect(screen.getByText('No workouts match these filters.')).toBeTruthy());
  });

  it('φιλτράρει ανά άσκηση', async () => {
    await seed();
    renderPage();
    await waitFor(() => expect(screen.getByText('Push A')).toBeTruthy());

    const sel = screen.getByLabelText('By exercise') as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: bench.id } });
    await waitFor(() => expect(screen.queryByText('Legs')).toBeNull());
    expect(screen.getByText('Push A')).toBeTruthy();
  });

  it('φιλτράρει ανά εύρος ημερομηνιών', async () => {
    await seed();
    renderPage();
    await waitFor(() => expect(screen.getByText('Push A')).toBeTruthy());

    // Από 2026-11-11 και μετά → μόνο το Legs (12/11).
    const from = document.querySelectorAll('input[type="date"]')[0] as HTMLInputElement;
    fireEvent.change(from, { target: { value: '2026-11-11' } });
    await waitFor(() => expect(screen.queryByText('Push A')).toBeNull());
    expect(screen.getByText('Legs')).toBeTruthy();
  });

  it('εναλλάσσει ομαδοποίηση μήνα/εβδομάδας', async () => {
    await seed();
    renderPage();
    await waitFor(() => expect(screen.getByText('Push A')).toBeTruthy());

    // Default: μήνας → υπάρχει group header «November 2026».
    expect(screen.getAllByText(/November 2026/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    await waitFor(() => {
      // Σε weekly grouping το «November 2026» (month label) φεύγει.
      expect(screen.queryByText(/November 2026/)).toBeNull();
    });
  });
});
