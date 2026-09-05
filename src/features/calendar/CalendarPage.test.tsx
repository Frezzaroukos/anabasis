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

/**
 * `calendar.adHocStart` είναι νέο κλειδί (ad-hoc free-text fix) — δεν είναι
 * ακόμα στο πραγματικό en.json (το ενημερώνει ο team lead). Ίδιο πρότυπο με
 * DashboardPage.test.tsx: local override, το test δεν εξαρτάται από αυτό.
 */
const calendarEn = { adHocStart: 'Start' };

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: { translation: { ...en, calendar: { ...en.calendar, ...calendarEn } } },
    },
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

  it('ad-hoc: γράφεις ελεύθερο κείμενο και φτιάχνει unlinked workout με αυτό το label', async () => {
    render(wrap(<CalendarPage />));

    // «Σήμερα» παραμένει η προεπιλεγμένη μέρα — δεν αλλάζουμε επιλογή.
    await waitFor(() => expect(screen.getByText(en.calendar.addWorkout)).toBeTruthy());
    fireEvent.click(screen.getByText(en.calendar.addWorkout));

    // Πλέον ΔΕΝ υπάρχει λίστα από 5 προκαθορισμένα activities — ένα πεδίο
    // ελεύθερου κειμένου. Ό,τι γράψεις γίνεται το label της προπόνησης.
    const input = await screen.findByPlaceholderText(en.workout.typePlaceholder);
    fireEvent.change(input, { target: { value: 'Basketball με φίλους' } });
    fireEvent.click(screen.getByLabelText(calendarEn.adHocStart));

    await waitFor(async () => {
      const rows = await db.workouts.toArray();
      expect(rows).toHaveLength(1);
    });

    const [workout] = await db.workouts.toArray();
    expect(workout!.program_id).toBeNull();
    expect(workout!.program_day_id).toBeNull();
    expect(workout!.activity_kind).toBe('strength');
    expect(workout!.workout_type).toBe('Basketball με φίλους');
    expect(localDay(new Date(workout!.started_at))).toBe('2026-08-15');

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/workout/active'),
    );
  });

  it('ad-hoc: το κουμπί έναρξης είναι ανενεργό όσο το πεδίο είναι κενό', async () => {
    render(wrap(<CalendarPage />));

    await waitFor(() => expect(screen.getByText(en.calendar.addWorkout)).toBeTruthy());
    fireEvent.click(screen.getByText(en.calendar.addWorkout));

    const submit = (await screen.findByLabelText(calendarEn.adHocStart)) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    const input = screen.getByPlaceholderText(en.workout.typePlaceholder);
    fireEvent.change(input, { target: { value: '  ' } });
    expect(submit.disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'Mini session' } });
    expect(submit.disabled).toBe(false);
  });
});

/**
 * Το adherence overlay έμπαινε σε ΚΑΘΕ κελί ξεχωριστά: με τα κενά ανάμεσά τους
 * διαβαζόταν σαν επτά κηλίδες αντί για «αυτή η εβδομάδα ήταν γεμάτη». Τώρα το
 * πλέγμα είναι γραμμές-εβδομάδες και το wash μπαίνει στη γραμμή. Τα tiers τα
 * καλύπτει το calendarMath.test.ts — εδώ κλειδώνουμε ότι το tint εφαρμόζεται
 * στο σωστό επίπεδο.
 */
describe('CalendarPage — πλέγμα ανά εβδομάδα', () => {
  it('κάθε εβδομάδα είναι δική της γραμμή 7 στηλών, και το κελί δεν κουβαλά tint', async () => {
    render(wrap(<CalendarPage />));
    await waitFor(() => expect(screen.getByText('3')).toBeTruthy());

    const cell = screen.getByText('3').closest('button');
    expect(cell).toBeTruthy();
    const row = cell!.parentElement!;
    expect(row.className).toContain('grid-cols-7');
    expect(cell!.className).not.toMatch(/bg-primary\//);
  });

  it('«σήμερα» σημαίνεται ΜΟΝΟ στον αριθμό — όχι και με ring στο κελί', async () => {
    render(wrap(<CalendarPage />));
    // 15/08/2026 = το σταθεροποιημένο «σήμερα».
    await waitFor(() => expect(screen.getByText('15')).toBeTruthy());

    const number = screen.getByText('15');
    expect(number.className).toContain('bg-primary');
    // Το ring του κελιού ανήκει πλέον στην ΕΠΙΛΕΓΜΕΝΗ μέρα, όχι στο σήμερα.
    // (Εδώ ταυτίζονται, οπότε ελέγχουμε ότι δεν υπάρχει διπλό ring-primary.)
    expect(number.closest('button')!.className).not.toContain('ring-primary ');
  });

  it('η υπόμνηση των κουκκίδων λείπει σε άδειο μήνα — δεν εξηγεί κάτι που δεν φαίνεται', async () => {
    render(wrap(<CalendarPage />));
    await waitFor(() => expect(screen.getByText('15')).toBeTruthy());
    expect(screen.queryByText(en.calendar.magnitudeHint)).toBeNull();
  });
});
