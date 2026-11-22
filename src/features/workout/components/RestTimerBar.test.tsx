import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { RestTimerBar } from './RestTimerBar';
import { __resetRestTimer, startRest, stopRest } from '../restTimer';

// Το rest timer είναι opt-in (απόφαση owner)· εδώ ελέγχουμε μόνο το a11y της
// μπάρας όταν είναι ενεργό, χωρίς ασύγχρονο Dexie query κάτω από fake timers.
vi.mock('@/hooks/useAppSettings', () => ({
  useAppSettings: () => ({ rest_timer_enabled: true, notify_rest_timer: false }),
}));

/**
 * Rest timer a11y: ο μετρητής ΔΕΝ ανακοινώνεται κάθε δευτερόλεπτο, αλλά το
 * ΤΕΛΟΣ («Rest over — go!») βγαίνει σε polite live region για screen reader.
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

const wrap = (ui: React.ReactNode) => <I18nextProvider i18n={i18next}>{ui}</I18nextProvider>;

beforeEach(() => __resetRestTimer());
afterEach(() => {
  stopRest();
  __resetRestTimer();
  vi.useRealTimers();
});

describe('RestTimerBar — screen reader', () => {
  it('δείχνει τον μετρητή χωρίς ζωντανή ανακοίνωση, αλλά ανακοινώνει το ΤΕΛΟΣ', async () => {
    vi.useFakeTimers();
    render(wrap(<RestTimerBar />));

    act(() => startRest(1, Date.now()));

    // Τρέχει: ορατός μετρητής, αλλά η polite status περιοχή είναι άδεια.
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(screen.getByTestId('rest-remaining').textContent).toMatch(/\d:\d\d/);
    const live = () => screen.getAllByRole('status').find((el) => el.className.includes('sr-only'))!;
    expect(live().textContent).toBe('');

    // Περνάει ο χρόνος (min rest = 5s) → finished. Το polite region λέει «Rest over — go!».
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(live().textContent).toBe(en.workout.rest.over);
    expect(live().getAttribute('aria-live')).toBe('polite');
  });

  it('τα −15/+15 και το stop έχουν προσβάσιμα ονόματα', () => {
    render(wrap(<RestTimerBar />));
    act(() => startRest(60, Date.now()));
    expect(screen.getByRole('button', { name: en.workout.rest.minus15 })).toBeTruthy();
    expect(screen.getByRole('button', { name: en.workout.rest.plus15 })).toBeTruthy();
    expect(screen.getByRole('button', { name: en.workout.rest.stop })).toBeTruthy();
  });
});
