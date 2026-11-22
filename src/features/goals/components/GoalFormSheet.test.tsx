import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { createExercise } from '@/lib/db/queries';
import type { AppSettings } from '@/lib/db/types';
import { GoalFormSheet } from './GoalFormSheet';

/**
 * audit #11: ό,τι πληκτρολογεί ο χρήστης lb πρέπει να αποθηκεύεται σε kg.
 * 225 lb → 102.06 kg. Ο edit δείχνει πίσω 225 lb (lossless round-trip).
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

const UID = 'goal-form-lb-test';

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
  <I18nextProvider i18n={i18next}>{ui}</I18nextProvider>
);

describe('GoalFormSheet — weight unit (audit #11)', () => {
  it('αποθηκεύει σε kg ό,τι πληκτρολογήθηκε σε lb (top_weight)', async () => {
    await seedLbSettings();
    const ex = await createExercise({ name: 'Weighted Pull-up' });

    render(wrap(<GoalFormSheet open onClose={() => {}} goal={null} />));

    // Διάλεξε «Target weight».
    fireEvent.click(screen.getByRole('button', { name: en.goals.metric.top_weight }));
    // Διάλεξε άσκηση.
    fireEvent.change(screen.getByPlaceholderText(en.workout.searchExercises), {
      target: { value: 'Weighted' },
    });
    fireEvent.click(await screen.findByText('Weighted Pull-up'));

    // Πληκτρολόγησε 225 (lb). Το πεδίο target δείχνει default '4' — το βρίσκουμε
    // από την τρέχουσα τιμή του (το Input δεν έχει type=number, role=textbox).
    const targetInput = (screen.getAllByRole('textbox') as HTMLInputElement[]).find(
      (el) => el.value === '4',
    )!;
    expect(targetInput).toBeTruthy();
    fireEvent.change(targetInput, { target: { value: '225' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.save }));

    await waitFor(async () => {
      const goals = await db.goals.toArray();
      expect(goals).toHaveLength(1);
      expect(goals[0]!.metric).toBe('top_weight');
      expect(goals[0]!.exercise_id).toBe(ex.id);
      // 225 lb = 102.06 kg (όχι 225).
      expect(goals[0]!.target).toBeCloseTo(102.06, 1);
    });
  });

  it('volume_kg: 10000 lb αποθηκεύεται σε kg (~4535.92) — lossless round-trip', async () => {
    await seedLbSettings();
    render(wrap(<GoalFormSheet open onClose={() => {}} goal={null} />));

    // Διάλεξε «Volume».
    fireEvent.click(screen.getByRole('button', { name: en.goals.metric.volume_kg }));

    // Το target δείχνει default '4'· το βρίσκουμε από την τιμή του.
    const targetInput = (screen.getAllByRole('textbox') as HTMLInputElement[]).find(
      (el) => el.value === '4',
    )!;
    expect(targetInput).toBeTruthy();
    fireEvent.change(targetInput, { target: { value: '10000' } });
    // Άφησε το React state να ενημερωθεί πριν το save (αλλιώς ο handler βλέπει
    // την παλιά τιμή — race μεταξύ change και click).
    await waitFor(() => expect((targetInput as HTMLInputElement).value).toBe('10000'));
    fireEvent.click(screen.getByRole('button', { name: en.common.save }));

    let savedId = '';
    await waitFor(async () => {
      const goals = await db.goals.toArray();
      expect(goals).toHaveLength(1);
      expect(goals[0]!.metric).toBe('volume_kg');
      // 10000 lb = 4535.92 kg (όχι 10000).
      expect(goals[0]!.target).toBeCloseTo(4535.92, 0);
      savedId = goals[0]!.id;
    });

    // Re-open για edit: το πεδίο πρέπει να δείχνει πίσω 10000 lb.
    const saved = await db.goals.get(savedId);
    const { unmount } = render(
      wrap(<GoalFormSheet open onClose={() => {}} goal={saved!} />),
    );
    await waitFor(() => {
      const shown = (screen.getAllByRole('textbox') as HTMLInputElement[]).some(
        (el) => el.value === '10000',
      );
      expect(shown).toBe(true);
    });
    unmount();
  });
});
