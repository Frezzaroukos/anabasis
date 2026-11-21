import { beforeEach, describe, expect, it, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { createScheduledSession, setScheduledSessionStatus } from '@/lib/db/scheduledSessions';
import { localDay } from '@/lib/db/queries';
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
});

const wrap = (ui: React.ReactNode) => (
  <I18nextProvider i18n={i18next}>
    <MemoryRouter>{ui}</MemoryRouter>
  </I18nextProvider>
);

describe('ScheduledTodayCard', () => {
  it('χωρίς planned σήμερα δεν ζωγραφίζει κάρτα', async () => {
    const { container } = render(wrap(<ScheduledTodayCard />));
    await waitFor(() => expect(container.textContent).toBe(''));
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
});
