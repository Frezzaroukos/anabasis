import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import en from '@/i18n/en.json';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { TrainingSettingsPage } from './TrainingSettingsPage';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
  }
});

beforeEach(async () => {
  setCurrentUserId('training-settings-profile');
  await db.app_settings.clear();
  await db.app_settings.put({
    id: 's1', user_id: 'training-settings-profile', default_rest_timer_seconds: 180, notify_pr: true,
    notify_session_reminder: false, notify_rest_timer: true, auto_start_rest_timer: true, rest_timer_enabled: true, reminder_time: null,
    reminder_days: [], show_e1rm: true, weight_unit: 'kg', theme: 'dark', dashboard_cards: [],
    coach_enabled: false, created_at: '', updated_at: '',
  } as never);
});

const settings = async () => (await db.app_settings.toArray())[0]!;

const renderPage = () =>
  render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter>
        <TrainingSettingsPage />
      </MemoryRouter>
    </I18nextProvider>,
  );

describe('TrainingSettingsPage — rest timer', () => {
  it('lets the user pick the default rest duration', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '3:00' }).getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: '1:30' }));
    await waitFor(async () => expect((await settings()).default_rest_timer_seconds).toBe(90));
    await waitFor(() => expect(screen.getByRole('button', { name: '1:30' }).getAttribute('aria-pressed')).toBe('true'));
  });

  it('turns auto-start off and back on (owner can opt out of the auto rest bar)', async () => {
    renderPage();
    const auto = await screen.findByRole('button', { name: en.settings.restAutoStart });
    await waitFor(() => expect(auto.getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(auto);
    await waitFor(async () => expect((await settings()).auto_start_rest_timer).toBe(false));
    fireEvent.click(auto);
    await waitFor(async () => expect((await settings()).auto_start_rest_timer).toBe(true));
  });

  it('toggles the end-of-rest alert', async () => {
    renderPage();
    const notify = await screen.findByRole('button', { name: en.settings.restNotify });
    fireEvent.click(notify);
    await waitFor(async () => expect((await settings()).notify_rest_timer).toBe(false));
  });

  it('ο κύριος διακόπτης είναι ΚΛΕΙΣΤΟΣ για παλιούς χρήστες και κρύβει τις υπο-ρυθμίσεις', async () => {
    await db.app_settings.update('s1', { rest_timer_enabled: undefined });
    renderPage();
    const master = await screen.findByRole('button', { name: en.settings.restTimerEnabled });
    expect(master.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: '1:30' })).toBeNull();
    expect(screen.queryByRole('button', { name: en.settings.restAutoStart })).toBeNull();
    fireEvent.click(master);
    await waitFor(async () => expect((await settings()).rest_timer_enabled).toBe(true));
    await screen.findByRole('button', { name: '1:30' });
  });
});
