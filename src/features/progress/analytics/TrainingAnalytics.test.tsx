import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { TrainingAnalytics } from './TrainingAnalytics';
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
});

const wrap = (ui: React.ReactNode) => <I18nextProvider i18n={i18next}>{ui}</I18nextProvider>;

describe('TrainingAnalytics', () => {
  it('χωρίς δεδομένα δεν ζωγραφίζει τίποτα (ούτε ψεύτικα μηδενικά)', async () => {
    setCurrentUserId('training-analytics-empty');
    const { container } = render(wrap(<TrainingAnalytics />));
    await waitFor(() => expect(container.textContent).toBe(''));
  });

  it('με καταγεγραμμένα σετ δείχνει volume/frequency/categories/PRs', async () => {
    setCurrentUserId('training-analytics-data');
    const ex = await createExercise({ name: 'Analytics Test Row', category: 'pull' });
    const w = await startWorkout('strength');
    await addSet({
      workout_id: w.id,
      exercise_id: ex.id,
      weight_kg: 20,
      bodyweight_kg: 80,
      reps: 5,
      hold_seconds: null,
    });
    await endWorkout(w.id);

    render(wrap(<TrainingAnalytics />));

    // Τέσσερα ανεξάρτητα useLiveQuery (volume/frequency/categories/PRs)
    // επιλύονται σε διαφορετικές microtask στιγμές. Το heading εμφανίζεται
    // μόλις επιστρέψει ΤΟ ΠΡΩΤΟ — οι υπόλοιπες ενότητες μπορεί να μην έχουν
    // ακόμη render-αριστεί. Γι' αυτό κάθε ενότητα περιμένει με findBy (όχι
    // σύγχρονο getBy), αλλιώς ο έλεγχος είναι flaky.
    expect(await screen.findByText('Training analytics')).toBeTruthy();
    expect(await screen.findByText('Weekly volume')).toBeTruthy();
    expect(await screen.findByText('Sessions per week')).toBeTruthy();
    expect(await screen.findByText('Sets per category')).toBeTruthy();
    expect(await screen.findByText('PR timeline')).toBeTruthy();

    // Κάθε γράφημα έχει προσβάσιμη σύνοψη (role=img + aria-label).
    expect(await screen.findByRole('img', { name: /Weekly training volume/ })).toBeTruthy();
    expect(await screen.findByRole('img', { name: /Sessions per week/ })).toBeTruthy();
    expect(await screen.findByRole('img', { name: /Working sets per category/ })).toBeTruthy();
    expect(await screen.findByRole('img', { name: /Cumulative personal records/ })).toBeTruthy();
  });
});
