import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { ProgressPage } from './ProgressPage';
import { setCurrentUserId } from '@/lib/db/session';
import { addSet, createExercise, endWorkout, startWorkout } from '@/lib/db/queries';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
  setCurrentUserId('progress-page-test-profile');
});

/** YYYY-MM-DD, `n` μέρες πριν από σήμερα — μέσα στο default 3M (90d) range. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const renderAt = (path = '/progress') =>
  render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter initialEntries={[path]}>
        <ProgressPage />
      </MemoryRouter>
    </I18nextProvider>,
  );

/**
 * Item #7 του backlog: ενοποίηση ProgressPage/ExerciseDetailPage γύρω από το
 * κοινό ExerciseProgressChart. Το ExerciseDetailPage είχε ήδη tests (τα
 * κρατάει το refactor πράσινα) — το ProgressPage δεν είχε ΚΑΝΕΝΑ test πριν.
 */
describe('ProgressPage', () => {
  it('αναζήτηση → επιλογή άσκησης → chart με tabs μόνο για metrics που έχουν δεδομένα (Top set/1RM/Reps/Volume, όχι Hold)', async () => {
    const ex = await createExercise({ name: 'Progress Chart Deadlift', category: 'legs' });

    const w1 = await startWorkout('strength', daysAgo(30));
    await addSet({
      workout_id: w1.id, exercise_id: ex.id,
      weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    await endWorkout(w1.id);

    const w2 = await startWorkout('strength', daysAgo(10));
    await addSet({
      workout_id: w2.id, exercise_id: ex.id,
      weight_kg: 110, bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    await endWorkout(w2.id);

    renderAt();
    fireEvent.change(screen.getByPlaceholderText('Search exercises…'), {
      target: { value: 'Progress Chart Deadlift' },
    });
    fireEvent.click(await screen.findByText('Progress Chart Deadlift', {}, { timeout: 5000 }));

    await waitFor(() => expect(screen.getByText(/2 sessions/)).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText('Top set')).toBeTruthy();
    expect(screen.getByText('Est. 1RM')).toBeTruthy();
    expect(screen.getByText('Volume')).toBeTruthy();
    expect(screen.getByText('Reps')).toBeTruthy();
    expect(screen.queryByText('Hold')).toBeNull();

    // Ο range selector είναι τώρα κοινός με το ExerciseDetailPage (item #7).
    expect(screen.getByRole('group')).toBeTruthy();

    // Best = 110 (το βαρύτερο σετ), όχι 100 (το πρώτο).
    await waitFor(
      () => expect(screen.getByTestId('exercise-best-value').textContent).toContain('110'),
      { timeout: 3000 },
    );
  });

  it('deep-link ?exerciseId= ανοίγει κατευθείαν το chart', async () => {
    const ex = await createExercise({ name: 'Deep Linked Row', category: 'pull' });
    const w1 = await startWorkout('strength', daysAgo(5));
    await addSet({
      workout_id: w1.id, exercise_id: ex.id,
      weight_kg: 40, bodyweight_kg: null, reps: 8, hold_seconds: null,
    });
    await endWorkout(w1.id);

    renderAt(`/progress?exerciseId=${ex.id}`);
    await waitFor(() => expect(screen.getByText('Deep Linked Row')).toBeTruthy());
  });

  it('χωρίς αποτελέσματα αναζήτησης δείχνει το empty state', async () => {
    renderAt();
    fireEvent.change(screen.getByPlaceholderText('Search exercises…'), {
      target: { value: 'ζζζ-δεν-υπάρχει-ζζζ' },
    });
    expect(await screen.findByText('No exercise matches.')).toBeTruthy();
  });

  it('προπονημένες πρώτα (πιο πρόσφατη πάνω)· οι «Not trained yet» σε collapsed ενότητα', async () => {
    const older = await createExercise({ name: 'Zz Older Lift', category: 'legs' });
    const newer = await createExercise({ name: 'Zz Newer Lift', category: 'legs' });
    const never = await createExercise({ name: 'Zz Never Lift', category: 'legs' });
    for (const [ex, ago] of [[older, 20], [newer, 3]] as const) {
      const w = await startWorkout('strength', daysAgo(ago));
      await addSet({
        workout_id: w.id, exercise_id: ex.id,
        weight_kg: 50, bodyweight_kg: null, reps: 5, hold_seconds: null,
      });
      await endWorkout(w.id);
    }

    renderAt();
    await screen.findByText('Zz Newer Lift', {}, { timeout: 5000 });
    const names = screen.getAllByText(/^Zz (Older|Newer) Lift$/).map((n) => n.textContent);
    expect(names).toEqual(['Zz Newer Lift', 'Zz Older Lift']);
    // collapsed: η «never» δεν φαίνεται
    expect(screen.queryByText(never.name)).toBeNull();
    const toggle = screen.getByRole('button', { name: /Not trained yet/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(await screen.findByText(never.name)).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});
