import { describe, expect, it, beforeAll } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { ProgramsPage } from './ProgramsPage';
import { db, LOCAL_USER_ID } from '@/lib/db';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import type { Program, ProgramDay, ProgramExercise } from '@/lib/db/types';

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

const PROGRAM_DAY: ProgramDay = {
  id: 'day-00000000-0000-4000-8000-000000000001',
  program_id: PROGRAM.id,
  name: 'Upper',
  position: 0,
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
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

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

const wrap = (ui: React.ReactNode, withLocation = false) => (
  <I18nextProvider i18n={i18next}>
    <MemoryRouter>
      {ui}
      {withLocation && <LocationProbe />}
    </MemoryRouter>
  </I18nextProvider>
);

describe('ProgramsPage', () => {
  it('δείχνει το seeded πρόγραμμα με το πλήθος ασκήσεων', async () => {
    render(wrap(<ProgramsPage />));
    await waitFor(() => expect(screen.getByText('Push A')).toBeTruthy());
    expect(screen.getByText(/1 exercises/i)).toBeTruthy();
  });

  it('το Start structured προγράμματος ξεκινά την επόμενη μέρα στο logger', async () => {
    await db.workouts.clear();
    await db.program_days.put(PROGRAM_DAY);

    render(wrap(<ProgramsPage />, true));

    await waitFor(() => expect(screen.getByText(/Upper/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: en.programs.start }));

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/workout/active'),
    );
    const workouts = await db.workouts.toArray();
    expect(workouts).toHaveLength(1);
    expect(workouts[0]!.program_id).toBe(PROGRAM.id);
    expect(workouts[0]!.program_day_id).toBe(PROGRAM_DAY.id);
    expect(workouts[0]!.workout_type).toBe('Upper #1');
  });
});
