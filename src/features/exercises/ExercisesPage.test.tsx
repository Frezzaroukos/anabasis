import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { ExercisesPage } from './ExercisesPage';
import { createExercise } from '@/lib/db/queries';

// Το namespace "exercises" δεν υπάρχει ακόμα στο πραγματικό src/i18n/en.json
// (άλλος agent το κάνει merge) — δικό μας feature folder δεν αγγίζει
// src/i18n/*.json, οπότε το προσθέτουμε εδώ μόνο για το test resource.
const EXERCISES_EN = {
  title: 'Exercises',
  available: 'in your library',
  new: 'New exercise',
  search: 'Search exercises…',
  empty: 'No exercises match.',
  emptyArchived: 'No archived exercises.',
  filter: { all: 'All', mine: 'Mine', archived: 'Archived' },
  builtin: 'Built-in',
  custom: 'Yours',
  archive: 'Archive',
  unarchive: 'Restore',
  editTitle: 'Edit exercise',
  newTitle: 'New exercise',
  movementType: { compound: 'Compound', isolation: 'Isolation', skill: 'Skill' },
  form: {
    name: 'Name',
    namePlaceholder: 'e.g. Weighted pull-up',
    category: 'Category',
    categoryPlaceholder: 'Type or pick a category…',
    movementType: 'Movement type',
    equipment: 'Equipment',
    equipmentPlaceholder: 'Type and press Enter…',
    isWeighted: 'Weighted',
    isBodyweight: 'Bodyweight',
    defaultUnit: 'Default unit',
    notes: 'Notes',
    notesPlaceholder: 'Cues, form notes…',
  },
};

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: { en: { translation: { ...en, exercises: EXERCISES_EN } } },
    interpolation: { escapeValue: false },
  });
});

const wrap = (ui: React.ReactNode) => (
  <I18nextProvider i18n={i18next}>
    <MemoryRouter>{ui}</MemoryRouter>
  </I18nextProvider>
);

describe('ExercisesPage', () => {
  it('δημιουργία με δική σου κατηγορία εμφανίζεται στη λίστα κάτω από τη νέα κατηγορία', async () => {
    await createExercise({ name: 'Neck Bridge Hold', category: 'neck' });

    render(wrap(<ExercisesPage />));

    await waitFor(() => expect(screen.getByText('Neck Bridge Hold')).toBeTruthy());
    // η κατηγορία «neck» δεν υπάρχει στις builtin — πρέπει να φανεί ως δική της ομάδα
    expect(screen.getByText('neck')).toBeTruthy();
  });

  it('η αρχειοθέτηση κρύβει την άσκηση από την ενεργή λίστα', async () => {
    await createExercise({ name: 'Isometric Wall Sit', category: 'legs' });

    render(wrap(<ExercisesPage />));

    await waitFor(() => expect(screen.getByText('Isometric Wall Sit')).toBeTruthy());
    const row = screen.getByText('Isometric Wall Sit').closest('li');
    expect(row).toBeTruthy();
    fireEvent.click(within(row as HTMLElement).getByLabelText('Archive'));

    await waitFor(() => expect(screen.queryByText('Isometric Wall Sit')).toBeNull());
  });
});
