import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { ExerciseCard } from './ExerciseCard';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { startWorkout } from '@/lib/db/queries';
import { SEED_EXERCISES } from '@/lib/db/seeds';

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
  setCurrentUserId('exercise-card-profile');
  await db.exercises.clear();
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.workouts.clear();
  await db.sets.clear();
});

const wrap = (ui: React.ReactNode) => <I18nextProvider i18n={i18next}>{ui}</I18nextProvider>;

const squat = SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;

/**
 * Η φόρμα καταγραφής σετ ΔΕΝ πρέπει να κλείνει μετά το save (owner: ήρεμη,
 * γρήγορη καταγραφή σετ-σετ) — χωρίς dominant timer, με το βάρος να μένει
 * ίδιο ανάμεσα σε σετ, μόνο τα reps καθαρίζουν, και refocus στο reps.
 */
describe('ExerciseCard — set-by-set logging stays calm', () => {
  it('μετά το save η φόρμα μένει ανοιχτή: κρατάει το βάρος, καθαρίζει τα reps, refocus', async () => {
    const workout = await startWorkout('strength');

    render(
      wrap(
        <ExerciseCard
          exercise={squat}
          workoutId={workout.id}
          sets={[]}
          weighted
          onWeightedChange={vi.fn()}
          chain={null}
          onChainChange={vi.fn()}
        />,
      ),
    );

    const weightInput = screen.getByLabelText('Weight (kg)');
    const repsInput = screen.getByLabelText('Reps');

    fireEvent.change(weightInput, { target: { value: '100' } });
    fireEvent.change(repsInput, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add set' }));

    await waitFor(async () => {
      const sets = await db.sets.where('workout_id').equals(workout.id).toArray();
      expect(sets).toHaveLength(1);
    });

    // Η φόρμα ΔΕΝ έκλεισε — τα inputs είναι ακόμα εκεί (όχι το "+ Add set" κουμπί).
    expect(screen.getByLabelText('Weight (kg)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add set' })).toBeTruthy();

    // Βάρος μένει, reps καθαρίζουν, focus πάει πίσω στα reps.
    await waitFor(() => {
      expect((screen.getByLabelText('Weight (kg)') as HTMLInputElement).value).toBe('100');
      expect((screen.getByLabelText('Reps') as HTMLInputElement).value).toBe('');
      expect(document.activeElement).toBe(screen.getByLabelText('Reps'));
    });
  });
});
