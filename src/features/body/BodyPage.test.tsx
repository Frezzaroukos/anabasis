import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { BodyPage } from './BodyPage';
import { localDay, saveBodyMetric } from '@/lib/db/queries';

/**
 * Ίδιο fixture-πρότυπο με τα υπόλοιπα tests: i18n merged με τα νέα `body.*`
 * keys που δεν έχουν ακόμα προστεθεί στο πραγματικό en.json/el.json.
 */
const bodyEnOverrides = {
  bodyFat: 'Body fat',
  bodyFatTrend: 'Body fat trend',
  stepsTrend: 'Steps',
};

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: {
        en: { translation: { ...en, body: { ...en.body, ...bodyEnOverrides } } },
      },
      interpolation: { escapeValue: false },
    });
  }
});

const wrap = (ui: React.ReactNode) => (
  <I18nextProvider i18n={i18next}>
    <MemoryRouter>{ui}</MemoryRouter>
  </I18nextProvider>
);

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDay(d);
};

describe('BodyPage — χωρίς δεδομένα', () => {
  it('render-άρει μόνο τη φόρμα καταγραφής, χωρίς κενά charts', async () => {
    render(wrap(<BodyPage />));
    await waitFor(() => expect(screen.getByText('Log today')).toBeTruthy());
    expect(screen.queryByText('Weight trend')).toBeNull();
    expect(screen.queryByText(bodyEnOverrides.bodyFatTrend)).toBeNull();
  });
});

describe('BodyPage — με βάρος/λίπος/βήματα καταγεγραμμένα', () => {
  beforeAll(async () => {
    await saveBodyMetric(daysAgo(2), { weight_kg: 79, body_fat_pct: 18, steps: 8000 });
    await saveBodyMetric(daysAgo(1), { weight_kg: 78.5, body_fat_pct: 17.5, steps: 9500 });
    await saveBodyMetric(localDay(), { weight_kg: 78, body_fat_pct: 17, steps: 11000 });
  });

  it('δείχνει τα charts βάρους, λίπους σώματος και βημάτων — όχι θερμίδες', async () => {
    render(wrap(<BodyPage />));

    await waitFor(() => expect(screen.getByText('Weight trend')).toBeTruthy());
    expect(screen.getByText(bodyEnOverrides.bodyFatTrend)).toBeTruthy();
    expect(screen.getAllByText(bodyEnOverrides.stepsTrend).length).toBeGreaterThan(0);
    // Οι θερμίδες βγήκαν εκτός scope — δεν εμφανίζονται πουθενά.
    expect(screen.queryByText('Calorie balance')).toBeNull();
  });
});
