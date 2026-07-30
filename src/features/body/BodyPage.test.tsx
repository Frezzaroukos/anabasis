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
  protein: 'Protein',
  bodyFat: 'Body fat',
  proteinPerKg: 'Protein/kg bodyweight',
  bodyFatTrend: 'Body fat trend',
  proteinTrend: 'Protein trend',
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
    expect(screen.queryByText(bodyEnOverrides.proteinTrend)).toBeNull();
  });
});

describe('BodyPage — με βάρος/πρωτεΐνη/λίπος καταγεγραμμένα', () => {
  beforeAll(async () => {
    await saveBodyMetric(daysAgo(2), { weight_kg: 79, protein_g: 150, body_fat_pct: 18 });
    await saveBodyMetric(daysAgo(1), {
      weight_kg: 78.5,
      protein_g: 160,
      body_fat_pct: 17.5,
      calories_in: 2400,
      calories_out: 2200,
    });
    await saveBodyMetric(localDay(), {
      weight_kg: 78,
      protein_g: 170,
      body_fat_pct: 17,
      calories_in: 2300,
      calories_out: 2200,
    });
  });

  it('δείχνει τα charts βάρους, λίπους σώματος, πρωτεΐνης και ισοζυγίου', async () => {
    render(wrap(<BodyPage />));

    await waitFor(() => expect(screen.getByText('Weight trend')).toBeTruthy());
    expect(screen.getByText(bodyEnOverrides.bodyFatTrend)).toBeTruthy();
    expect(screen.getByText(bodyEnOverrides.proteinTrend)).toBeTruthy();
    expect(screen.getByText('Calorie balance')).toBeTruthy();

    // πρωτεΐνη/kg υπολογισμένη από το σημερινό βάρος+πρωτεΐνη (170/78 ≈ 2.2)
    expect(screen.getByText(/2\.2 g\/kg/)).toBeTruthy();
  });
});
