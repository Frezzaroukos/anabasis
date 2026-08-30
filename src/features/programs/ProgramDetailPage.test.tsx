import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { ProgramDetailPage } from './ProgramDetailPage';
import { db, LOCAL_USER_ID } from '@/lib/db';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import type { Program, ProgramDay, ProgramExercise } from '@/lib/db/types';

const NOW = '2026-07-01T00:00:00.000Z';

// «programs.day*» keys δεν υπάρχουν ακόμα στο πραγματικό src/i18n/en.json (ο
// orchestrator τα προσθέτει) — ίδιο pattern με ExercisesPage.test.tsx: local
// merge μόνο για το test resource.
const PROGRAMS_DAY_KEYS_EN = {
  day: 'Day',
  dayNamePlaceholder: 'Day name',
  addDay: 'Add day',
  renameDay: 'Rename day',
  deleteDay: 'Delete day',
  deleteDayConfirmTitle: 'Delete this day?',
  deleteDayConfirmDesc: "This removes the day and all its exercises. This can't be undone.",
  startDay: 'Start day',
  addDays: 'Add days',
  addDaysHint: 'Split this program into named days, like Upper and Lower.',
  dayCount: '{{count}} day',
  dayCount_other: '{{count}} days',
  moveDayLeft: 'Move day earlier',
  moveDayRight: 'Move day later',
};

const PROGRAM: Program = {
  id: 'prog-00000000-0000-4000-8000-000000000002',
  user_id: LOCAL_USER_ID,
  name: 'Bench day',
  description: null,
  activity_kind: 'strength',
  display_order: 0,
  target_sessions_per_week: null,
  is_archived: false,
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
};

// Δύο γραμμές με ΙΔΙΑ άσκηση + ίδιο group_key → πρέπει να εμφανίζονται ως ένα dropset.
const DROPSET_GROUP_KEY = 'grp-dropset-1';
const DROPSET_A: ProgramExercise = {
  id: 'pe-00000000-0000-4000-8000-000000000010',
  program_id: PROGRAM.id,
  program_day_id: null,
  exercise_id: SEED_EXERCISES[0]!.id,
  position: 0,
  target_sets: 1,
  target_reps: 8,
  target_weight_kg: 60,
  target_hold_seconds: null,
  set_type: 'normal',
  group_key: DROPSET_GROUP_KEY,
  notes: null,
  created_at: NOW,
  updated_at: NOW,
};
const DROPSET_B: ProgramExercise = {
  ...DROPSET_A,
  id: 'pe-00000000-0000-4000-8000-000000000011',
  position: 1,
  target_weight_kg: 40,
};

// Μία μονή άσκηση χωρίς group_key.
const SINGLE: ProgramExercise = {
  id: 'pe-00000000-0000-4000-8000-000000000012',
  program_id: PROGRAM.id,
  program_day_id: null,
  exercise_id: SEED_EXERCISES[1]!.id,
  position: 2,
  target_sets: 3,
  target_reps: 10,
  target_weight_kg: null,
  target_hold_seconds: null,
  set_type: 'normal',
  group_key: null,
  notes: null,
  created_at: NOW,
  updated_at: NOW,
};

// Δεύτερο πρόγραμμα, δομημένο σε μέρες (v12) — ξεχωριστό id ώστε να μη
// συγκρούεται με το flat PROGRAM παραπάνω.
const PROGRAM_DAYS: Program = {
  ...PROGRAM,
  id: 'prog-00000000-0000-4000-8000-000000000003',
  name: 'Push Pull Legs',
};
const DAY_UPPER: ProgramDay = {
  id: 'day-00000000-0000-4000-8000-000000000001',
  program_id: PROGRAM_DAYS.id,
  name: 'Upper',
  position: 0,
  created_at: NOW,
  updated_at: NOW,
};
const DAY_LOWER: ProgramDay = {
  id: 'day-00000000-0000-4000-8000-000000000002',
  program_id: PROGRAM_DAYS.id,
  name: 'Lower',
  position: 1,
  created_at: NOW,
  updated_at: NOW,
};
const UPPER_EXERCISE: ProgramExercise = {
  id: 'pe-00000000-0000-4000-8000-000000000020',
  program_id: PROGRAM_DAYS.id,
  program_day_id: DAY_UPPER.id,
  exercise_id: SEED_EXERCISES[2]!.id,
  position: 0,
  target_sets: 3,
  target_reps: 8,
  target_weight_kg: null,
  target_hold_seconds: null,
  set_type: 'normal',
  group_key: null,
  notes: null,
  created_at: NOW,
  updated_at: NOW,
};

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: { translation: { ...en, programs: { ...en.programs, ...PROGRAMS_DAY_KEYS_EN } } },
    },
    interpolation: { escapeValue: false },
  });
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.programs.bulkAdd([PROGRAM, PROGRAM_DAYS]);
  await db.program_exercises.bulkAdd([DROPSET_A, DROPSET_B, SINGLE, UPPER_EXERCISE]);
  await db.program_days.bulkAdd([DAY_UPPER, DAY_LOWER]);
});

const wrap = (ui: React.ReactNode, path: string) => (
  <I18nextProvider i18n={i18next}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/programs/:programId" element={ui} />
      </Routes>
    </MemoryRouter>
  </I18nextProvider>
);

describe('ProgramDetailPage', () => {
  it('ομαδοποιεί σωστά το group_key σε dropset και δείχνει τη μονή άσκηση ξεχωριστά', async () => {
    render(wrap(<ProgramDetailPage />, `/programs/${PROGRAM.id}`));

    await waitFor(() => expect(screen.getByText('Bench day')).toBeTruthy());
    // Οι γραμμές έρχονται από ΞΕΧΩΡΙΣΤΟ liveQuery (getProgramWithExercises) —
    // περίμενε να render-αριστούν πριν ελέγξεις την ομαδοποίηση.
    await waitFor(() =>
      expect(screen.getAllByText(SEED_EXERCISES[0]!.name).length).toBe(2),
    );
    // Το dropset badge (όχι τα per-row set-type pill κουμπιά) εμφανίζεται μία φορά για την αλυσίδα.
    const dropsetLabels = screen
      .getAllByText('Drop set')
      .filter((el) => el.tagName !== 'BUTTON');
    expect(dropsetLabels.length).toBe(1);
    // Και οι δύο γραμμές της αλυσίδας (ίδια άσκηση) render-άρονται.
    expect(screen.getAllByText(SEED_EXERCISES[0]!.name).length).toBe(2);
    // Η μονή άσκηση εμφανίζεται μία φορά, χωρίς badge αλυσίδας.
    expect(screen.getAllByText(SEED_EXERCISES[1]!.name).length).toBe(1);
  });
});

describe('ProgramDetailPage — μέρες (v12)', () => {
  it('δείχνει τις μέρες του προγράμματος και η προσθήκη άσκησης πάει στην ενεργή μέρα', async () => {
    render(wrap(<ProgramDetailPage />, `/programs/${PROGRAM_DAYS.id}`));

    await waitFor(() => expect(screen.getByText('Push Pull Legs')).toBeTruthy());

    // Και οι δύο μέρες render-άρονται ως tabs (aria-label — το «Upper» εμφανίζεται
    // ΚΑΙ ως heading της ενεργής μέρας, οπότε το tab πρέπει να διακρίνεται).
    await waitFor(() => expect(screen.getByLabelText('Day 1: Upper')).toBeTruthy());
    expect(screen.getByLabelText('Day 2: Lower')).toBeTruthy();

    // Προεπιλογή: πρώτη μέρα ενεργή → δείχνει τη δική της άσκηση.
    expect(screen.getByRole('heading', { name: 'Upper' })).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText(SEED_EXERCISES[2]!.name)).toBeTruthy(),
    );

    // Αλλαγή σε «Lower» → άδεια ακόμα (καμία γραμμή σε αυτή τη μέρα).
    fireEvent.click(screen.getByLabelText('Day 2: Lower'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Lower' })).toBeTruthy());
    await waitFor(() => expect(screen.getByText('No exercises yet. Add one below.')).toBeTruthy());

    // Προσθήκη άσκησης ενώ «Lower» είναι ενεργή → πρέπει να προσγειωθεί ΕΚΕΙ.
    fireEvent.click(screen.getByText('Add exercise'));
    await waitFor(() => expect(screen.getByText(SEED_EXERCISES[3]!.name)).toBeTruthy());
    fireEvent.click(screen.getByText(SEED_EXERCISES[3]!.name));
    fireEvent.click(screen.getByText('Add 1'));

    await waitFor(() => expect(screen.getByText(SEED_EXERCISES[3]!.name)).toBeTruthy());
    // Η «Upper» ΔΕΝ πήρε τη νέα άσκηση — έμεινε μόνο η δική της.
    fireEvent.click(screen.getByLabelText('Day 1: Upper'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Upper' })).toBeTruthy());
    await waitFor(() => expect(screen.getByText(SEED_EXERCISES[2]!.name)).toBeTruthy());
    expect(screen.queryByText(SEED_EXERCISES[3]!.name)).toBeNull();
  });
});
