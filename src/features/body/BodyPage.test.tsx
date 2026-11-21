import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('το Edit γεμίζει τη φόρμα με τις τιμές της επιλεγμένης ημέρας', async () => {
    render(wrap(<BodyPage />));
    await waitFor(() => expect(screen.getByText('Recent entries')).toBeTruthy());

    // Οι καταχωρίσεις είναι φθίνουσες: [σήμερα, χθες, 2 μέρες πριν].
    fireEvent.click(screen.getAllByLabelText('Edit entry')[2]!);

    await waitFor(() => {
      // Τα πρώτα 3 spinbuttons είναι βάρος/λίπος/βήματα· τα υπόλοιπα είναι περιφέρειες.
      const values = (screen.getAllByRole('spinbutton') as HTMLInputElement[])
        .slice(0, 3)
        .map((i) => i.value);
      expect(values).toEqual(['79', '18', '8000']);
    });
    expect(screen.getByText(/Log for/)).toBeTruthy();
  });

  it('το Delete ζητά επιβεβαίωση· Cancel δεν σβήνει, Confirm καθαρίζει την ημέρα', async () => {
    render(wrap(<BodyPage />));
    await waitFor(() => expect(screen.getByText('Recent entries')).toBeTruthy());

    // Πρώτο κλικ → dialog, Cancel → η καταχώριση μένει.
    fireEvent.click(screen.getAllByLabelText('Clear entry')[2]!);
    expect(await screen.findByText('Delete this measurement?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Delete this measurement?')).toBeNull());
    expect(screen.getByText('79 kg')).toBeTruthy();

    // Δεύτερο κλικ → Confirm → η γραμμή φεύγει (soft-clear).
    fireEvent.click(screen.getAllByLabelText('Clear entry')[2]!);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('79 kg')).toBeNull());
  });
});

describe('BodyPage — περιφέρειες (Wave 4)', () => {
  beforeEach(async () => {
    // Καθαρή κατάσταση ανά test: μόνο περιφέρειες, για να μετράμε το chart τους.
    const { db } = await import('@/lib/db');
    await db.body_metrics.clear();
    await saveBodyMetric(daysAgo(4), { waist_cm: 84, chest_cm: 100 });
    await saveBodyMetric(daysAgo(2), { waist_cm: 83 });
    await saveBodyMetric(localDay(), { waist_cm: 82 });
  });

  it('αποθηκεύει περιφέρεια από τη φόρμα (cm) και τη βλέπει στην τάση', async () => {
    render(wrap(<BodyPage />));
    // Η φόρμα έχει label «Waist (cm)» — γράφουμε νέα τιμή και Save.
    const waist = await screen.findByLabelText('Waist (cm)');
    fireEvent.change(waist, { target: { value: '81' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      const { getBodyMetric } = await import('@/lib/db/queries');
      const today = await getBodyMetric(localDay());
      expect(today?.waist_cm).toBe(81);
    });
  });

  it('δείχνει chart τάσης μέτρησης με επιλογέα και διαφορά από την πρώτη', async () => {
    render(wrap(<BodyPage />));
    // Ο επιλογέας μέτρησης + το chart είναι παρόντα (hasAnyMeasurement).
    const select = await screen.findByLabelText('Measurement');
    expect(select).toBeTruthy();
    // Η διαφορά 84 → 82 φαίνεται ως −2 cm (πρόσημο).
    await waitFor(() => expect(screen.getByText(/−2 cm/)).toBeTruthy());
  });

  it('δείχνει validation error για τιμή εκτός ορίων (>300cm)', async () => {
    render(wrap(<BodyPage />));
    const waist = await screen.findByLabelText('Waist (cm)');
    fireEvent.change(waist, { target: { value: '9999' } });
    expect(waist.getAttribute('aria-invalid')).toBe('true');
    expect(await screen.findByText('Enter a value between 0 and 300 cm')).toBeTruthy();
  });
});
