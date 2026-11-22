import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { RestTimerBar } from './RestTimerBar';
import { __resetRestTimer, startRest } from '../restTimer';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
  }
});

const put = (enabled: boolean | undefined) =>
  db.app_settings.put({
    id: 's1', user_id: 'rest-bar-profile', default_rest_timer_seconds: 90, notify_pr: true,
    notify_session_reminder: false, notify_rest_timer: true, auto_start_rest_timer: true,
    rest_timer_enabled: enabled, reminder_time: null, reminder_days: [], show_e1rm: true,
    weight_unit: 'kg', theme: 'dark', dashboard_cards: [], coach_enabled: false, created_at: '', updated_at: '',
  } as never);

beforeEach(async () => {
  setCurrentUserId('rest-bar-profile');
  await db.app_settings.clear();
  __resetRestTimer();
});
afterEach(() => __resetRestTimer());

const renderBar = () =>
  render(
    <I18nextProvider i18n={i18next}>
      <RestTimerBar />
    </I18nextProvider>,
  );

describe('RestTimerBar — optional (owner decision)', () => {
  it('renders nothing when the rest timer is off, even if a countdown exists', async () => {
    await put(undefined);
    renderBar();
    await act(async () => startRest(60));
    await new Promise((r) => setTimeout(r, 80));
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('shows the countdown when the rest timer is enabled', async () => {
    await put(true);
    renderBar();
    await act(async () => startRest(60));
    await waitFor(() => expect(screen.getByRole('timer')).toBeTruthy());
    expect(screen.getByTestId('rest-remaining').textContent).toMatch(/^[01]:\d\d$/);
  });
});
