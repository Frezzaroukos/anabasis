import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { ActivityLogForm } from './ActivityLogForm';
import { formatDurationInput, parseDurationInput } from '@/features/activities/duration';
import { db } from '@/lib/db';
import { startWorkout } from '@/lib/db/queries';

/**
 * Τα i18n keys `setTypes`/`chain`/`distanceKm`/`pace`/`feel`/`notes*` δεν
 * υπάρχουν ακόμα στο πραγματικό en.json (τα προσθέτει ξεχωριστά ο owner
 * του i18n layer) — εδώ τα προσθέτουμε ΜΟΝΟ στο test resource bundle ώστε
 * το smoke test να μη σπάει λόγω raw-key fallback.
 */
const TEST_RESOURCES = {
  ...en,
  workout: {
    ...en.workout,
    distanceKm: 'Distance (km)',
    pace: 'Pace',
    feel: 'Feel',
    notes: 'Notes',
    notesPlaceholder: 'How did it go?',
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

const wrap = (ui: React.ReactNode) => <I18nextProvider i18n={i18next}>{ui}</I18nextProvider>;

describe('duration parsing', () => {
  it('δέχεται 25, 25:30 και 1:05:00 — αρνείται αρνητικά/0/άκυρα/>24h', () => {
    expect(parseDurationInput('25')).toBe(25 * 60);
    expect(parseDurationInput('25:30')).toBe(25 * 60 + 30);
    expect(parseDurationInput('1:05:00')).toBe(3600 + 5 * 60);
    expect(parseDurationInput(' 0 ')).toBeNull();
    expect(parseDurationInput('-5')).toBeNull();
    expect(parseDurationInput('25:75')).toBeNull();
    expect(parseDurationInput('1:65:00')).toBeNull();
    expect(parseDurationInput('25:00')).toBe(1500);
    expect(parseDurationInput('24:00:00')).toBe(86400);
    expect(parseDurationInput('24:00:01')).toBeNull();
  });

  it('μορφοποιεί πάντα σε mm:ss ή h:mm:ss', () => {
    expect(formatDurationInput(1500)).toBe('25:00');
    expect(formatDurationInput(3900)).toBe('1:05:00');
    expect(formatDurationInput(59)).toBe('0:59');
  });
});

describe('ActivityLogForm', () => {
  it('δείχνει απόσταση+ρυθμό για δραστηριότητα run, όχι για basketball', async () => {
    const run = await startWorkout('run');
    const { unmount } = render(wrap(<ActivityLogForm workout={run} />));
    expect(screen.getByLabelText('Distance (km)')).toBeTruthy();
    unmount();

    const basketball = await startWorkout('basketball');
    render(wrap(<ActivityLogForm workout={basketball} />));
    expect(screen.queryByLabelText('Distance (km)')).toBeNull();
  });

  it('αποθηκεύει απόσταση στο blur μέσω updateWorkoutDistance', async () => {
    const run = await startWorkout('run');
    render(wrap(<ActivityLogForm workout={run} />));

    const input = screen.getByLabelText('Distance (km)');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);

    await waitFor(async () => {
      const updated = await db.workouts.get(run.id);
      expect(updated?.distance_km).toBe(5);
    });
  });

  it('χειροκίνητη διάρκεια «25» → 1500s και pace 5:00/km για 5km', async () => {
    const run = await startWorkout('run');
    render(wrap(<ActivityLogForm workout={run} />));

    const distance = screen.getByLabelText('Distance (km)');
    fireEvent.change(distance, { target: { value: '5' } });
    fireEvent.blur(distance);
    const duration = screen.getByLabelText('Duration');
    fireEvent.change(duration, { target: { value: '25' } });
    fireEvent.blur(duration);

    await waitFor(async () => {
      const updated = await db.workouts.get(run.id);
      expect(updated?.duration_seconds).toBe(1500);
    });
    expect(screen.getByText('5:00/km')).toBeTruthy();
  });

  it('αρνείται αρνητική/μηδενική απόσταση και άκυρη διάρκεια', async () => {
    const run = await startWorkout('run');
    render(wrap(<ActivityLogForm workout={run} />));

    const distance = screen.getByLabelText('Distance (km)');
    fireEvent.change(distance, { target: { value: '-5' } });
    fireEvent.blur(distance);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

    const duration = screen.getByLabelText('Duration');
    fireEvent.change(duration, { target: { value: '1:99' } });
    fireEvent.blur(duration);
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);

    const updated = await db.workouts.get(run.id);
    expect(updated?.distance_km).toBeNull();
    expect(updated?.duration_seconds).toBeNull();
  });

  it('επιλέγει feel και το αποθηκεύει μέσω updateWorkoutMeta', async () => {
    const mobility = await startWorkout('mobility');
    render(wrap(<ActivityLogForm workout={mobility} />));

    fireEvent.click(screen.getByRole('radio', { name: '4' }));

    await waitFor(async () => {
      const updated = await db.workouts.get(mobility.id);
      expect(updated?.feel).toBe(4);
    });
  });
});
