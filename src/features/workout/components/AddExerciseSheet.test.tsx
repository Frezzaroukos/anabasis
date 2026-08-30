import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { AddExerciseSheet } from './AddExerciseSheet';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { SEED_EXERCISES } from '@/lib/db/seeds';

/**
 * `useTyped`/`searchOrTypeExercise` δεν υπάρχουν ακόμα στο πραγματικό
 * en.json (τα προσθέτει ξεχωριστά ο owner του i18n layer) — προστίθενται
 * ΜΟΝΟ στο test resource bundle, ίδιο pattern με ActivityLogForm.test.tsx.
 */
const TEST_RESOURCES = {
  ...en,
  workout: {
    ...en.workout,
    searchOrTypeExercise: 'Search or type any exercise…',
    useTyped: 'Use "{{name}}"',
  },
};

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: TEST_RESOURCES } },
      interpolation: { escapeValue: false },
    });
  } else {
    i18next.addResourceBundle('en', 'translation', TEST_RESOURCES, true, true);
  }
});

beforeEach(async () => {
  setCurrentUserId('add-exercise-sheet-profile');
  await db.exercises.clear();
  await db.exercises.bulkPut(SEED_EXERCISES);
});

const wrap = (ui: React.ReactNode) => <I18nextProvider i18n={i18next}>{ui}</I18nextProvider>;

describe('AddExerciseSheet', () => {
  it('δείχνει suggestions ενώ γράφεις και επιλέγει υπάρχουσα άσκηση', async () => {
    const onPick = vi.fn();
    render(wrap(<AddExerciseSheet open onClose={vi.fn()} onPick={onPick} />));

    const input = screen.getByPlaceholderText('Search or type any exercise…');
    fireEvent.change(input, { target: { value: 'Back Squat' } });

    const match = await screen.findByText('Back Squat');
    fireEvent.click(match);

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]![0].name).toBe('Back Squat');
  });

  it('create-on-miss: γράφεις κάτι που δεν υπάρχει → «Use "<name>»" το δημιουργεί και το επιλέγει', async () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(wrap(<AddExerciseSheet open onClose={onClose} onPick={onPick} />));

    const input = screen.getByPlaceholderText('Search or type any exercise…');
    fireEvent.change(input, { target: { value: 'Zercher Carry' } });

    const useButton = await screen.findByText('Use "Zercher Carry"');
    fireEvent.click(useButton);

    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    const created = onPick.mock.calls[0]![0];
    expect(created.name).toBe('Zercher Carry');

    const stored = await db.exercises.get(created.id);
    expect(stored?.name).toBe('Zercher Carry');
    expect(onClose).toHaveBeenCalled();
  });

  it('ΔΕΝ προσφέρει «Use» όταν υπάρχει ήδη ακριβώς αυτή η άσκηση (case-insensitive)', async () => {
    render(wrap(<AddExerciseSheet open onClose={vi.fn()} onPick={vi.fn()} />));

    const input = screen.getByPlaceholderText('Search or type any exercise…');
    fireEvent.change(input, { target: { value: 'back squat' } });

    // Περιμένει να φορτώσει η live query (useExercises) πριν κρίνει απουσία.
    await screen.findByText('Back Squat');
    expect(screen.queryByText('Use "back squat"')).toBeNull();
  });
});
