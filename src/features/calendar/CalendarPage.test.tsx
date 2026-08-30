import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { CalendarPage } from './CalendarPage';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { SEED_ACTIVITIES } from '@/lib/db/seeds';
import { createProgram, createProgramDay, localDay } from '@/lib/db/queries';

/**
 * Το Calendar είναι πλέον το σημείο εκκίνησης καταγραφής (ARCHITECTURE-V4 §1-2):
 * επιλογή μέρας → «+ Προπόνηση» → πρόγραμμα-μέρα (linked, auto-αρίθμηση) ή
 * ad-hoc (χωρίς σύνδεση). Ημερομηνία σταθεροποιημένη με fake timers ώστε το
 * «σήμερα» της κάθε δοκιμής να είναι προβλέψιμο μέσα στο πλέγμα του μήνα.
 */
const FIXED_NOW = new Date('2026-08-15T12:00:00.000Z');

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});

beforeEach(async () => {
  // Μόνο το Date μοκάρεται (χωρίς vi.useFakeTimers()) — το testing-library
  // `waitFor` βασίζεται σε πραγματικά setTimeout για polling.
  vi.setSystemTime(FIXED_NOW);
  setCurrentUserId('calendar-add-workout-test');
  await db.workouts.clear();
  await db.programs.clear();
  await db.program_days.clear();
  await db.program_exercises.clear();
  await db.activities.clear();
  await db.body_metrics.clear();
  await db.activities.bulkAdd(SEED_ACTIVITIES);
});

afterEach(() => {
  vi.useRealTimers();
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

const wrap = (ui: React.ReactNode) => (
  <I18nextProvider i18n={i18next}>
    <MemoryRouter>
      {ui}
      <LocationProbe />
    </MemoryRouter>
  </I18nextProvider>
);

describe('CalendarPage — add workout από την επιλεγμένη μέρα', () => {
  it('πρόγραμμα-μέρα: φτιάχνει linked workout στην επιλεγμένη (backdated) μέρα και πλοηγεί στο active', async () => {
    const program = await createProgram('Split');
    const upper = await createProgramDay(program.id, 'Upper');

    render(wrap(<CalendarPage />));

    // Επιλογή της 1ης του μήνα — σίγουρα διαφορετική από το «σήμερα» (15/08).
    await waitFor(() => expect(screen.getByText('1')).toBeTruthy());
    fireEvent.click(screen.getByText('1'));

    fireEvent.click(screen.getByText(en.calendar.addWorkout));
    await waitFor(() => expect(screen.getByText('Upper')).toBeTruthy());
    fireEvent.click(screen.getByText('Upper'));

    await waitFor(async () => {
      const rows = await db.workouts.toArray();
      expect(rows).toHaveLength(1);
    });

    const [workout] = await db.workouts.toArray();
    expect(workout!.program_id).toBe(program.id);
    expect(workout!.program_day_id).toBe(upper.id);
    expect(workout!.workout_type).toBe('Upper #1');
    expect(localDay(new Date(workout!.started_at))).toBe('2026-08-01');

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/workout/active'),
    );
  });

  it('ad-hoc: φτιάχνει unlinked workout χωρίς πρόγραμμα', async () => {
    render(wrap(<CalendarPage />));

    // «Σήμερα» παραμένει η προεπιλεγμένη μέρα — δεν αλλάζουμε επιλογή.
    await waitFor(() => expect(screen.getByText(en.calendar.addWorkout)).toBeTruthy());
    fireEvent.click(screen.getByText(en.calendar.addWorkout));

    await waitFor(() => expect(screen.getByText('Strength')).toBeTruthy());
    fireEvent.click(screen.getByText('Strength'));

    await waitFor(async () => {
      const rows = await db.workouts.toArray();
      expect(rows).toHaveLength(1);
    });

    const [workout] = await db.workouts.toArray();
    expect(workout!.program_id).toBeNull();
    expect(workout!.program_day_id).toBeNull();
    expect(workout!.activity_kind).toBe('strength');
    expect(localDay(new Date(workout!.started_at))).toBe('2026-08-15');

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/workout/active'),
    );
  });
});
