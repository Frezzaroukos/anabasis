import { beforeAll, describe, expect, it } from 'vitest';
import i18next from 'i18next';
import en from '@/i18n/en.json';
import { goalTitle } from './goalTitle';

/**
 * Ο τίτλος δείχνει τα βάρη στη μονάδα του χρήστη. Το storage είναι kg· για
 * χρήστη lb το «@ 61.23 kg» γίνεται «@ 135 lb». Default (χωρίς weightUnit)
 * μένει kg ώστε οι παλιοί καλούντες (dashboard) να μη σπάνε.
 */
let t: Parameters<typeof goalTitle>[0];

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
  t = i18next.t.bind(i18next) as unknown as Parameters<typeof goalTitle>[0];
});

describe('goalTitle — μονάδα βάρους (audit #11)', () => {
  it('top_weight: δείχνει lb όταν ο χρήστης είναι σε lb', () => {
    // 61.23 kg = 135 lb
    const title = goalTitle(
      t,
      { metric: 'top_weight', target: 61.23, period: 'week', activity_key: null, exercise_id: null },
      { exercise: 'Pull-up', weightUnit: 'lb' },
    );
    expect(title).toContain('135');
    expect(title).toContain('lb');
    expect(title).not.toContain('kg');
  });

  it('top_weight: δείχνει kg όταν ο χρήστης είναι σε kg', () => {
    const title = goalTitle(
      t,
      { metric: 'top_weight', target: 70, period: 'week', activity_key: null, exercise_id: null },
      { exercise: 'Pull-up', weightUnit: 'kg' },
    );
    expect(title).toContain('70');
    expect(title).toContain('kg');
  });

  it('strength: το target_weight δείχνεται στη μονάδα του χρήστη', () => {
    const title = goalTitle(
      t,
      {
        metric: 'strength',
        target: 5,
        target_reps: 5,
        target_weight: 61.23, // 135 lb
        load_mode: 'total',
        period: 'all',
        activity_key: null,
        exercise_id: null,
      },
      { exercise: 'Bench', weightUnit: 'lb' },
    );
    expect(title).toContain('135');
    expect(title).toContain('lb');
  });
});
