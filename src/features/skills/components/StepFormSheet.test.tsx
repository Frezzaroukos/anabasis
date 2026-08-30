import { describe, expect, it, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { StepFormSheet } from './StepFormSheet';
import type { SkillStep } from '@/lib/db/types';

// added_weight_kg (v13) ακόμα δεν υπάρχει στο πραγματικό src/i18n/en.json —
// ίδιο μοτίβο με το ExercisesPage.test.tsx: τοπικό override μόνο για το test.
const SKILLS_EN = {
  ...en.skills,
  addedWeight: 'Added weight (kg)',
  addedWeightPlaceholder: 'kg (optional)',
};

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: { ...en, skills: SKILLS_EN } } },
      interpolation: { escapeValue: false },
    });
  }
});

const wrap = (ui: React.ReactNode) => <I18nextProvider i18n={i18next}>{ui}</I18nextProvider>;

const STEP: SkillStep = {
  id: 'step-1',
  skill_id: 'skill-1',
  step_number: 1,
  name: 'Tuck Front Lever',
  description: '',
  target_type: 'hold',
  target_value: 10,
  target_unit: 'sec',
  added_weight_kg: 7,
  benchmark_video_url: null,
  prerequisites: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('StepFormSheet — added_weight_kg (v13 difficulty enrichment)', () => {
  it('προγεμίζει το πεδίο βάρους σε edit mode', () => {
    render(
      wrap(
        <StepFormSheet open onClose={() => {}} onSubmit={() => {}} initial={STEP} />,
      ),
    );
    const input = screen.getByLabelText('Added weight (kg)') as HTMLInputElement;
    expect(input.value).toBe('7');
  });

  it('submit-άρει added_weight_kg μαζί με το βήμα (round-trip)', async () => {
    const onSubmit = vi.fn();
    render(wrap(<StepFormSheet open onClose={() => {}} onSubmit={onSubmit} />));

    fireEvent.change(screen.getByLabelText('Step name'), {
      target: { value: 'Full Front Lever' },
    });
    fireEvent.change(screen.getByLabelText('Added weight (kg)'), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByText('Save'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Full Front Lever', added_weight_kg: 5 }),
    );
  });

  it('χωρίς τιμή → added_weight_kg: null (bodyweight, όχι undefined)', async () => {
    const onSubmit = vi.fn();
    render(wrap(<StepFormSheet open onClose={() => {}} onSubmit={onSubmit} />));

    fireEvent.change(screen.getByLabelText('Step name'), {
      target: { value: 'Bodyweight step' },
    });
    fireEvent.click(screen.getByText('Save'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ added_weight_kg: null }),
    );
  });
});
