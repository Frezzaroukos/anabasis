import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { createExercise } from '@/lib/db/queries';
import { createGoal } from '@/lib/db/goals';
import type { AppSettings } from '@/lib/db/types';
import { GoalsCard } from './GoalsCard';

/**
 * B3 follow-up #1: το GoalsCard στην Αρχική πρέπει να περνά το weightUnit του
 * χρήστη στο goalTitle, ώστε ένας χρήστης lb να βλέπει «135 lb», όχι «61 kg».
 */
beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
});

const UID = 'goals-card-lb-test';

async function seedLbSettings() {
  const row = {
    id: 'settings-1',
    user_id: UID,
    default_rest_timer_seconds: 120,
    dashboard_cards: [],
    notify_pr: true,
    notify_session_reminder: true,
    notify_rest_timer: true,
    auto_start_rest_timer: true,
    reminder_time: null,
    reminder_days: [],
    show_e1rm: true,
    weight_unit: 'lb' as const,
    theme: 'dark' as const,
    coach_enabled: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } satisfies AppSettings;
  await db.app_settings.put(row);
}

beforeEach(async () => {
  setCurrentUserId(UID);
  await db.goals.clear();
  await db.app_settings.clear();
  await db.exercises.clear();
});

const wrap = (ui: React.ReactNode) => (
  <I18nextProvider i18n={i18next}>
    <MemoryRouter>{ui}</MemoryRouter>
  </I18nextProvider>
);

describe('GoalsCard — weight unit (B3 #1)', () => {
  it('δείχνει top_weight goal σε lb για χρήστη lb (135 lb, όχι 61 kg)', async () => {
    await seedLbSettings();
    const ex = await createExercise({ name: 'Weighted Pull-up' });
    // 61.23 kg = 135 lb
    await createGoal({
      metric: 'top_weight',
      target: 61.23,
      period: 'week',
      exercise_id: ex.id,
    });

    render(wrap(<GoalsCard />));

    await waitFor(() => {
      const text = document.body.textContent ?? '';
      expect(text).toContain('135');
      expect(text).toContain('lb');
    });
    // Δεν πρέπει να λέει «61 kg» για lb χρήστη.
    expect(document.body.textContent).not.toMatch(/61(\.\d+)? kg/);
  });
});
