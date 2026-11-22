import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import { QuickPasteWorkoutSheet } from './QuickPasteWorkoutSheet';
import { loadPasteMemory } from '../pasteMemory';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
  configurable: true,
});

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
  }
});

beforeEach(async () => {
  store.clear();
  setCurrentUserId('paste-sheet-profile');
  await db.exercises.clear();
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.workouts.clear();
  await db.sets.clear();
});

const renderSheet = (onSaved = vi.fn()) =>
  render(
    <I18nextProvider i18n={i18next}>
      <QuickPasteWorkoutSheet open onClose={vi.fn()} onSaved={onSaved} />
    </I18nextProvider>,
  );

const type = (text: string) =>
  fireEvent.change(screen.getByLabelText(en.workout.pasteNotes), { target: { value: text } });

describe('QuickPasteWorkoutSheet', () => {
  it('shows parsed sets and lets the user fix the numbers inline', async () => {
    renderSheet();
    type('Bench: 80kg 5+4');
    await screen.findByText(/80 kg × 5/);
    const edit = screen.getByLabelText(en.workout.pasteNotesEditSets);
    fireEvent.change(edit, { target: { value: '90kg 3x3' } });
    await waitFor(() => expect(screen.getAllByText(/90 kg × 3/)).toHaveLength(3));
    expect(screen.queryByText(/80 kg × 5/)).toBeNull();
  });

  it('flags a line with no valid set and keeps it out of the save count', async () => {
    renderSheet();
    type('Bench 80kg 0');
    const alert = await screen.findByText(en.workout.pasteNotesUnreadable);
    expect(alert).toBeTruthy();
    const save = screen.getByRole('button', { name: /Save/i });
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });

  it('flags suspicious values (900kg)', async () => {
    renderSheet();
    type('Bench 900kg 5');
    expect(await screen.findByText(en.workout.pasteNotesSuspect)).toBeTruthy();
  });

  it('saves and remembers a corrected exercise match', async () => {
    const onSaved = vi.fn();
    renderSheet(onSaved);
    type('Rows machine: 40kg 8,8');
    await screen.findAllByText(/40 kg × 8/);
    await screen.findByRole('option', { name: 'Inverted Rows' }); // η βιβλιοθήκη φορτώνει ασύγχρονα
    const select = screen.getByLabelText(en.workout.pasteNotesMatchExercise) as HTMLSelectElement;
    const inverted = SEED_EXERCISES.find((e) => e.name === 'Inverted Rows')!;
    fireEvent.change(select, { target: { value: inverted.id } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(Object.values(loadPasteMemory())).toContain(inverted.id);
    const sets = await db.sets.toArray();
    expect(sets.filter((s) => s.exercise_id === inverted.id)).toHaveLength(2);
  });
});
