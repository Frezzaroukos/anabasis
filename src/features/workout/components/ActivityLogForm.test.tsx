import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { ActivityLogForm } from './ActivityLogForm';
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
