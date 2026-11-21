import { beforeEach, describe, expect, it, beforeAll } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { createScheduledSession, setScheduledSessionStatus } from '@/lib/db/scheduledSessions';
import { localDay, startWorkout } from '@/lib/db/queries';
import { ScheduledTodayCard } from './ScheduledTodayCard';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
});

beforeEach(async () => {
  setCurrentUserId('scheduled-today-card');
  await db.scheduled_sessions.clear();
  await db.workouts.clear();
  await db.sets.clear();
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

describe('ScheduledTodayCard', () => {
  it('χωρίς planned σήμερα δεν ζωγραφίζει κάρτα', async () => {
    const { container } = render(wrap(<ScheduledTodayCard />));
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
    expect(screen.queryByText('Today in your plan')).toBeNull();
  });

  it('δείχνει τίτλο/ώρα των planned σημερινών και κρύβει τα skipped', async () => {
    await createScheduledSession({ date: localDay(), time: '18:30', title: 'Upper plan' });
    const skipped = await createScheduledSession({
      date: localDay(),
      title: 'Skipped plan',
    });
    await setScheduledSessionStatus(skipped.id, 'skipped');

    render(wrap(<ScheduledTodayCard />));

    expect(await screen.findByText('Today in your plan')).toBeTruthy();
    expect(screen.getByText('Upper plan')).toBeTruthy();
    expect(screen.getByText('18:30')).toBeTruthy();
    expect(screen.queryByText('Skipped plan')).toBeNull();
  });

  it('κάθε planned row έχει δικό του Start', async () => {
    await createScheduledSession({ date: localDay(), title: 'Upper plan' });
    await createScheduledSession({ date: localDay(), title: 'Lower plan' });

    render(wrap(<ScheduledTodayCard />));

    expect(await screen.findByRole('button', { name: 'Start Upper plan' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start Lower plan' })).toBeTruthy();
  });

  it('Start ξεκινά linked workout και πλοηγεί στο active', async () => {
    await createScheduledSession({ date: localDay(), title: 'Upper plan' });

    render(wrap(<ScheduledTodayCard />));
    fireEvent.click(await screen.findByRole('button', { name: 'Start Upper plan' }));

    await waitFor(async () => {
      const [row] = await db.scheduled_sessions.toArray();
      expect(row!.workout_id).toBeTruthy();
    });
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/workout/active'),
    );
    expect(await db.workouts.count()).toBe(1);
  });

  it('με ενεργή προπόνηση δείχνει «Συνέχεια» αντί για δεύτερο Start', async () => {
    await startWorkout('strength');
    await createScheduledSession({ date: localDay(), title: 'Upper plan' });

    render(wrap(<ScheduledTodayCard />));

    const cont = await screen.findByRole('button', { name: 'Continue Upper plan' });
    expect(screen.queryByRole('button', { name: 'Start Upper plan' })).toBeNull();

    fireEvent.click(cont);
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/workout/active'),
    );
    expect(await db.workouts.count()).toBe(1);
  });
});
