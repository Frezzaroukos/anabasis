import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { ProgramsPage } from './ProgramsPage';
import { db, LOCAL_USER_ID } from '@/lib/db';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import type { Program, ProgramExercise } from '@/lib/db/types';

const NOW = '2026-07-01T00:00:00.000Z';

const PROGRAM: Program = {
  id: 'prog-00000000-0000-4000-8000-000000000001',
  user_id: LOCAL_USER_ID,
  name: 'Push A',
  description: null,
  activity_kind: 'strength',
  display_order: 0,
  target_sessions_per_week: null,
  is_archived: false,
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
};

const PROGRAM_EXERCISE: ProgramExercise = {
  id: 'pe-00000000-0000-4000-8000-000000000001',
  program_id: PROGRAM.id,
  program_day_id: null,
  exercise_id: SEED_EXERCISES[0]!.id,
  position: 0,
  target_sets: 4,
  target_reps: 8,
  target_weight_kg: 60,
  target_hold_seconds: null,
  set_type: 'normal',
  group_key: null,
  notes: null,
  created_at: NOW,
  updated_at: NOW,
};

/**
 * Smoke test: η λίστα προγραμμάτων render-άρει με πραγματικά seed δεδομένα
 * (πρόγραμμα + πλήθος ασκήσεων), ίδιο pattern με SkillsPage.test.tsx.
 */
beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.programs.add(PROGRAM);
  await db.program_exercises.add(PROGRAM_EXERCISE);
});

const wrap = (ui: React.ReactNode) => (
  <I18nextProvider i18n={i18next}>
    <MemoryRouter>{ui}</MemoryRouter>
  </I18nextProvider>
);

describe('ProgramsPage', () => {
  it('δείχνει το seeded πρόγραμμα με το πλήθος ασκήσεων', async () => {
    render(wrap(<ProgramsPage />));
    await waitFor(() => expect(screen.getByText('Push A')).toBeTruthy());
    expect(screen.getByText(/1 exercises/i)).toBeTruthy();
  });
});
