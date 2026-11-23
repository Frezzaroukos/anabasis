import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import type { SetEntry } from '@/lib/db/types';
import { ToastProvider } from '@/components/ui/toast';
import { SetRow } from './SetRow';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
  }
});

const set = {
  id: 's1', workout_id: 'w1', exercise_id: 'e1', set_number: 1, weight_kg: 17.5, bodyweight_kg: 75,
  reps: 8, rest_pause_reps: [], hold_seconds: null, rpe: null, rir: null, tempo: null, is_warmup: false,
  is_failure: false, set_type: 'normal', group_id: null, notes: null, rest_seconds: null,
  created_at: '2026-11-21T18:00:00.000Z', updated_at: '2026-11-21T18:00:00.000Z', deleted_at: null,
} as SetEntry;

const renderRow = (onMove?: () => void) =>
  render(
    <I18nextProvider i18n={i18next}>
      <ToastProvider>
        <SetRow set={set} weighted onMoveToExercise={onMove} />
      </ToastProvider>
    </I18nextProvider>,
  );

describe('SetRow — touch targets', () => {
  it('logger rows (3 actions): 44×44 on touch screens', () => {
    renderRow();
    for (const name of [en.workout.duplicateSet, en.common.edit, en.common.delete]) {
      const button = screen.getAllByRole('button', { name }).find((b) => b.getAttribute('aria-hidden') !== 'true')!;
      expect(button.className).toContain('tap:h-11');
      expect(button.className).toContain('tap:w-11');
    }
  });

  it('history rows (4 actions incl. move): 40 wide so "#1 BW+17.5kg × 8" stays on one line at 390px', () => {
    renderRow(vi.fn());
    const move = screen.getByRole('button', { name: en.workout.moveSet });
    expect(move.className).toContain('tap:h-11');
    expect(move.className).toContain('tap:w-10');
    expect(move.className).not.toContain('tap:w-11');
  });
});
