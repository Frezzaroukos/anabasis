import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { ProgramDetailPage } from './ProgramDetailPage';
import { db, LOCAL_USER_ID } from '@/lib/db';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import type { Program, ProgramExercise } from '@/lib/db/types';

const NOW = '2026-07-01T00:00:00.000Z';

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

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.programs.add(PROGRAM);
  await db.program_exercises.bulkAdd([DROPSET_A, DROPSET_B, SINGLE]);
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
