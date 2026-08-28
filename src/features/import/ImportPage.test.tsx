import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next, { type i18n as I18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import en from '@/i18n/en.json';
import { db } from '@/lib/db/schema';
import { setCurrentUserId } from '@/lib/db/session';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import { ImportPage } from './ImportPage';

/**
 * Τα νέα import.* κλειδιά περνιούνται εδώ inline μέχρι να μπουν στα
 * en/el.json από τον orchestrator (τα json είναι εκτός ownership αυτής της
 * αλλαγής) — το test τεκμηριώνει ταυτόχρονα ΠΟΙΑ κλειδιά χρειάζονται.
 */
const NEW_KEYS = {
  subtitle: 'Import history from Notion, Strong, or Hevy — preview first, then confirm.',
  source: 'Source',
  sourceNotionCalories: 'Notion calories',
  sourceNotionWeights: 'Notion weight',
  sourceStrong: 'Strong CSV',
  sourceHevy: 'Hevy CSV',
  weightPlaceholder: 'Paste from Notion here…\n\nΟκτώβριος:\n- [x] 04-10-2025: 71,5\n…',
  csvPlaceholder: 'Paste the CSV export here…',
  chooseFile: 'Choose CSV file',
  weightHint:
    'The month comes from the Greek header, same as calories. Decimals with comma or dot, with or without “kg”.',
  strongHint:
    'Strong: Settings → Export Data. Both dialects work (iOS commas, Android semicolons) — lbs are converted to kg.',
  hevyHint: 'Hevy: Profile → Settings → Export & Import Data. Weights are already in kg.',
  workouts: 'workouts',
  sets: 'sets',
  badRows: 'unreadable rows',
  invalidDate: 'impossible date — will not be imported',
  invalidDates: 'impossible dates',
  willCreateExercises: '{{count}} new exercises will be created:',
  doImportWorkouts: 'Import {{count}} workouts',
  workoutsDone:
    'Done — {{workouts}} workouts, {{sets}} sets, {{exercises}} new exercises, {{duplicates}} duplicates skipped.',
};

let i18nTest: I18n;

beforeAll(async () => {
  i18nTest = i18next.createInstance();
  await i18nTest.init({
    lng: 'en',
    resources: {
      en: { translation: { ...en, import: { ...en.import, ...NEW_KEYS } } },
    },
    interpolation: { escapeValue: false },
  });
});

beforeEach(async () => {
  setCurrentUserId('import-page-test-profile');
  await db.exercises.clear();
  await db.workouts.clear();
  await db.sets.clear();
  await db.personal_records.clear();
  await db.body_metrics.clear();
  await db.exercises.bulkPut(SEED_EXERCISES);
});

function renderPage() {
  return render(
    <I18nextProvider i18n={i18nTest}>
      <MemoryRouter>
        <ImportPage />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

const STRONG_CSV = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2025-01-15 17:45:32,"Push Day",1h 30m,"Bench Press",1,80,8,,,,,8
2025-01-15 17:45:32,"Push Day",1h 30m,"Zercher Squat",1,60,5,,,,,`;

describe('ImportPage — Strong CSV flow', () => {
  it('preview → confirm: δείχνει counts/νέες ασκήσεις και γράφει στη βάση', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Strong CSV' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: STRONG_CSV } });

    // preview με counts + ποιες ασκήσεις θα δημιουργηθούν (async lookup)
    await waitFor(() => expect(screen.getByText(/1 workouts · 2 sets/)).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByText('Zercher Squat', { selector: 'span' })).toBeTruthy(),
    );
    expect(screen.getByText(/1 new exercises will be created/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Import 1 workouts' }));
    await waitFor(() =>
      expect(
        screen.getByText('Done — 1 workouts, 2 sets, 1 new exercises, 0 duplicates skipped.'),
      ).toBeTruthy(),
    );
    expect(await db.workouts.count()).toBe(1);
    expect(await db.sets.count()).toBe(2);
  });

  it('ξετσεκαρισμένο workout δεν εισάγεται', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Strong CSV' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: STRONG_CSV } });
    await waitFor(() => expect(screen.getByLabelText('2025-01-15')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('2025-01-15')); // ξετσεκάρισμα
    expect(
      (screen.getByRole('button', { name: 'Import 0 workouts' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('ImportPage — Notion daily flows', () => {
  it('θερμίδες: αδύνατη ημερομηνία = κλειδωμένο checkbox, εκτός import', async () => {
    renderPage(); // default source: notion-calories
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Φεβρουάριος:\n- [x] 28-02-2025:2500\n- [x] 31-02-2025:2600' },
    });

    await waitFor(() => expect(screen.getByText(/Preview · 2 days/)).toBeTruthy());
    const invalid = screen.getByLabelText('2025-02-31') as HTMLInputElement;
    expect(invalid.disabled).toBe(true);
    expect(invalid.checked).toBe(false);
    expect(screen.getByText('impossible date — will not be imported')).toBeTruthy();

    // μόνο η πραγματική μέρα μετράει στο κουμπί
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 days' }));
    await waitFor(() => expect(screen.getByText(/Done — 1 added/)).toBeTruthy());
    const metrics = await db.body_metrics.toArray();
    expect(metrics).toHaveLength(1);
    expect(metrics[0]!.date).toBe('2025-02-28');
    expect(metrics[0]!.calories_in).toBe(2500);
  });

  it('βάρος: γράφει weight_kg στα body_metrics', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Notion weight' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Οκτώβριος:\n- [x] 04-10-2025: 71,5\n- [x] 05-10-2025: 71.2' },
    });

    await waitFor(() => expect(screen.getByText(/Preview · 2 days/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 days' }));
    await waitFor(() => expect(screen.getByText(/Done — 2 added/)).toBeTruthy());

    const metrics = await db.body_metrics.toArray();
    expect(metrics.map((m) => m.weight_kg).sort()).toEqual([71.2, 71.5]);
    // οι θερμίδες της μέρας δεν πειράζονται από το βάρος
    expect(metrics.every((m) => m.calories_in === null)).toBe(true);
  });
});
