import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { createScheduledSession } from '@/lib/db/scheduledSessions';
import { localDay, saveBodyMetric, startWorkout } from '@/lib/db/queries';
import { StartWorkoutCta } from './StartWorkoutCta';
import { HomeQuickActions } from './HomeQuickActions';

const USER = 'home-cta-lane';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
  i18next.addResourceBundle('en', 'translation', en, true, true);
});

beforeEach(async () => {
  setCurrentUserId(USER);
  await db.workouts.where('user_id').equals(USER).delete();
  await db.scheduled_sessions.where('user_id').equals(USER).delete();
  await db.body_metrics.where('user_id').equals(USER).delete();
});

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

const wrap = (ui: React.ReactNode) => (
  <I18nextProvider i18n={i18next}>
    <MemoryRouter>
      {ui}
      <LocationProbe />
    </MemoryRouter>
  </I18nextProvider>
);

describe('StartWorkoutCta', () => {
  it('χωρίς ενεργή και χωρίς πρόγραμμα ξεκινά σημερινή συνεδρία με ένα πάτημα', async () => {
    render(wrap(<StartWorkoutCta />));
    fireEvent.click(await screen.findByRole('button', { name: /Start workout/ }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/workout/active'));
    const rows = await db.workouts.where('user_id').equals(USER).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ended_at).toBeNull();
  });

  it('με ενεργή προπόνηση το κουμπί είναι συνέχεια, όχι δεύτερη έναρξη', async () => {
    await startWorkout('strength');
    render(wrap(<StartWorkoutCta />));
    const link = await screen.findByRole('link', { name: /Continue workout/ });
    expect(link.getAttribute('href')).toBe('/workout/active');
    expect(screen.queryByRole('button', { name: /Start workout/ })).toBeNull();
  });

  it('με προγραμματισμένη σήμερα ξεκινά εκείνη, όχι κενή συνεδρία', async () => {
    await createScheduledSession({ date: localDay(), title: 'Upper plan' });
    render(wrap(<StartWorkoutCta />));
    fireEvent.click(await screen.findByRole('button', { name: /Start Upper plan/ }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/workout/active'));
    const [workout] = await db.workouts.where('user_id').equals(USER).toArray();
    expect(workout!.workout_type).toBe('Upper plan');
  });
});

describe('HomeQuickActions — βάρος', () => {
  it('ανοίγει με την τελευταία τιμή και την αποθηκεύει σήμερα με δεύτερο πάτημα', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await saveBodyMetric(localDay(yesterday), { weight_kg: 81 });

    render(wrap(<HomeQuickActions />));
    fireEvent.click(screen.getByRole('button', { name: 'Weight' }));

    const input = (await screen.findByRole('spinbutton')) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('81'));
    expect(screen.getByText(/Last entry/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      const today = await db.body_metrics.where('[user_id+date]').equals([USER, localDay()]).first();
      expect(today?.weight_kg).toBe(81);
      expect(today?.deleted_at ?? null).toBeNull();
    });
  });
});
