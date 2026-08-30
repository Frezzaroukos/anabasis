import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { ExerciseDetailPage } from './ExerciseDetailPage';
import { setCurrentUserId } from '@/lib/db/session';
import { addSet, createExercise, endWorkout, startWorkout } from '@/lib/db/queries';

// exercises.detail.* (v13 chart page) ακόμα δεν υπάρχει στο πραγματικό
// src/i18n/en.json — ίδιο μοτίβο με τα υπόλοιπα tests αυτού του lane.
const EXERCISES_EN = {
  ...en.exercises,
  editTitle: 'Edit exercise',
  detail: {
    reps: 'Reps',
    lastPerformed: 'Last performed',
    noHistory: 'No sets logged yet for this exercise.',
  },
};

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: { ...en, exercises: EXERCISES_EN } } },
      interpolation: { escapeValue: false },
    });
  }
  setCurrentUserId('exercise-detail-test-profile');
});

const renderAt = (exerciseId: string) =>
  render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter initialEntries={[`/exercises/${exerciseId}`]}>
        <Routes>
          <Route path="/exercises/:exerciseId" element={<ExerciseDetailPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );

describe('ExerciseDetailPage', () => {
  it('δείχνει το chart (reps/βάρος/e1RM/όγκος) όταν υπάρχουν ≥2 sessions', async () => {
    const ex = await createExercise({ name: 'Detail Chart Squat', category: 'legs' });

    const w1 = await startWorkout('strength', '2026-01-01');
    await addSet({
      workout_id: w1.id, exercise_id: ex.id,
      weight_kg: 80, bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    await endWorkout(w1.id);

    const w2 = await startWorkout('strength', '2026-01-08');
    await addSet({
      workout_id: w2.id, exercise_id: ex.id,
      weight_kg: 70, bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    await endWorkout(w2.id);

    renderAt(ex.id);
    await waitFor(() => expect(screen.getByText('Detail Chart Squat')).toBeTruthy());

    // 4 μετρικά toggles
    expect(screen.getByText('Reps')).toBeTruthy();
    expect(screen.getByText('Top set')).toBeTruthy();
    expect(screen.getByText('Est. 1RM')).toBeTruthy();
    expect(screen.getByText('Volume')).toBeTruthy();

    expect(screen.getByText(/2 sessions/)).toBeTruthy();
    // best (top weight) = 80kg, ΟΧΙ 70 (το τελευταίο) — απόδειξη ότι δείχνει
    // το καλύτερο της περιόδου, δεν είναι απλά «τελευταίο σετ»
    await waitFor(() =>
      expect(screen.getByTestId('exercise-best-value').textContent).toContain('80'),
    );
    // «last performed» δείχνει το ΤΕΛΕΥΤΑΙΟ σετ (70kg), διαφορετικό από το best
    expect(screen.getByText(/Last performed/)).toBeTruthy();
    expect(screen.getByText(/70 kg/)).toBeTruthy();
  });

  it('empty state όταν υπάρχει <2 σετ ιστορικού', async () => {
    const ex = await createExercise({ name: 'Fresh Never Logged', category: 'core' });
    renderAt(ex.id);

    await waitFor(() => expect(screen.getByText('Fresh Never Logged')).toBeTruthy());
    expect(screen.getByText('No sets logged yet for this exercise.')).toBeTruthy();
  });

  it('το pencil ανοίγει το edit sheet', async () => {
    const ex = await createExercise({ name: 'Editable From Detail', category: 'push' });
    renderAt(ex.id);

    await waitFor(() => expect(screen.getByText('Editable From Detail')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Edit exercise'));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  });
});
