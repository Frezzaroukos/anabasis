import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { addSet, createExercise, startWorkout } from '@/lib/db/queries';
import { DuplicateSuggestions } from './DuplicateSuggestions';

/**
 * Το panel προτείνει διπλότυπα (ίδιο κανονικοποιημένο όνομα) και ενώνει με
 * ConfirmDialog. Ελέγχουμε ότι εμφανίζονται μόνο τα πραγματικά διπλότυπα και
 * ότι η ένωση μετακινεί τα σετ + αρχειοθετεί την πηγή.
 */
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
  setCurrentUserId('dup-suggest-test');
  await db.exercises.clear();
  await db.sets.clear();
  await db.workouts.clear();
});

describe('DuplicateSuggestions', () => {
  it('δεν δείχνει τίποτα όταν δεν υπάρχουν διπλότυπα', async () => {
    await createExercise({ name: 'Bench Press' });
    await createExercise({ name: 'Back Squat' });
    const { container } = render(
      <I18nextProvider i18n={i18next}>
        <DuplicateSuggestions />
      </I18nextProvider>,
    );
    // Δεν υπάρχει <details> — το component επιστρέφει null.
    await waitFor(() => expect(container.querySelector('details')).toBeNull());
  });

  it('εντοπίζει διπλότυπα και η ένωση μετακινά τα σετ στην επιλεγμένη', async () => {
    const a = await createExercise({ name: 'Pull-up' });
    const b = await createExercise({ name: 'Pull ups' });
    const w = await startWorkout('strength');
    await addSet({ workout_id: w.id, exercise_id: a.id, weight_kg: 10, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await addSet({ workout_id: w.id, exercise_id: b.id, weight_kg: 20, bodyweight_kg: null, reps: 3, hold_seconds: null });

    render(
      <I18nextProvider i18n={i18next}>
        <DuplicateSuggestions />
      </I18nextProvider>,
    );

    // Το group εμφανίζεται.
    await waitFor(() => expect(screen.getByText(/Possible duplicates/)).toBeTruthy());

    // «Ένωση» → ConfirmDialog → επιβεβαίωση.
    fireEvent.click(screen.getByRole('button', { name: en.exercises.duplicates.merge }));
    await waitFor(() => expect(screen.getByText(/Merge duplicates into/)).toBeTruthy());
    // Το κουμπί επιβεβαίωσης του dialog έχει το ίδιο label· το δεύτερο είναι του dialog.
    const confirmBtns = screen.getAllByRole('button', { name: en.exercises.duplicates.merge });
    fireEvent.click(confirmBtns[confirmBtns.length - 1]!);

    // Ο `confirmMerge` τρέχει async· το `finally` του (setBusy/setPending/setImpact)
    // πρέπει να ολοκληρωθεί ΜΕΣΑ στο test, αλλιώς τρέχει μετά το teardown και το
    // setState σκάει με «window is not defined». Περίμενε να κλείσει το dialog —
    // κλείνει μόνο αφού εκτελεστεί το `finally` (setPending(null)).
    await waitFor(() =>
      expect(screen.queryByText(/Merge duplicates into/)).toBeNull(),
    );

    // Μία από τις δύο αρχειοθετείται και τα σετ μαζεύονται σε μία.
    await waitFor(async () => {
      const rows = await db.exercises.toArray();
      const archived = rows.filter((e) => e.is_archived).length;
      expect(archived).toBe(1);
    });
    const keptIds = (await db.exercises.toArray())
      .filter((e) => !e.is_archived)
      .map((e) => e.id);
    const setsForKept = await db.sets
      .filter((s) => keptIds.includes(s.exercise_id))
      .count();
    expect(setsForKept).toBe(2);
  });
});
