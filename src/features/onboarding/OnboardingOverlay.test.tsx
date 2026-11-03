import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import el from '@/i18n/el.json';
import { ONBOARDING_STORAGE_KEY, OnboardingOverlay } from './OnboardingOverlay';

// Node 26+ ορίζει δικό του (πειραματικό, ανενεργό) global localStorage που
// σκιάζει το jsdom's window.localStorage στο vitest· in-memory polyfill εδώ
// ώστε το test να είναι deterministic ανεξαρτήτως Node version.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

Object.defineProperty(window, 'localStorage', {
  value: createMemoryStorage(),
  configurable: true,
});

// Πραγματικά resources από τα en.json/el.json — έτσι ένα stale inline copy ή
// ένα σπασμένο i18n key στο onboarding πιάνεται αμέσως.
beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      el: { translation: el },
    },
    interpolation: { escapeValue: false },
  });
});

beforeEach(async () => {
  window.localStorage.clear();
  await i18next.changeLanguage('en');
});

afterEach(() => {
  window.localStorage.clear();
});

const wrap = (ui: React.ReactNode) => (
  <I18nextProvider i18n={i18next}>
    <MemoryRouter>{ui}</MemoryRouter>
  </I18nextProvider>
);

describe('OnboardingOverlay', () => {
  it('εμφανίζεται όταν δεν υπάρχει το window.localStorage flag', () => {
    render(wrap(<OnboardingOverlay />));
    expect(screen.getByText('Train the basics. Climb the skills.')).toBeTruthy();
  });

  it('δεν εμφανίζεται αν έχει ήδη γίνει onboard', () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    render(wrap(<OnboardingOverlay />));
    expect(screen.queryByText('Train the basics. Climb the skills.')).toBeNull();
  });

  it('«Παράλειψη» κλείνει το overlay και γράφει το flag', () => {
    render(wrap(<OnboardingOverlay />));
    fireEvent.click(screen.getByText('Skip'));
    expect(screen.queryByText('Train the basics. Climb the skills.')).toBeNull();
    expect(window.localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe('1');
  });

  it('«Πίσω» γυρίζει στο προηγούμενο slide', () => {
    render(wrap(<OnboardingOverlay />));
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('One ladder, two worlds')).toBeTruthy();
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Train the basics. Climb the skills.')).toBeTruthy();
  });

  it('τα βήματα είναι clickable και πηγαίνουν μπρος/πίσω', () => {
    render(wrap(<OnboardingOverlay />));
    fireEvent.click(screen.getByLabelText('Anabasis 3'));
    expect(screen.getByText('Yours, offline, private')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Anabasis 1'));
    expect(screen.getByText('Train the basics. Climb the skills.')).toBeTruthy();
  });

  it('προχωράει στα slides και ολοκληρώνει στο τελευταίο', () => {
    render(wrap(<OnboardingOverlay />));
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('One ladder, two worlds')).toBeTruthy();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Yours, offline, private')).toBeTruthy();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Train smart, stay safe')).toBeTruthy();
    fireEvent.click(screen.getByText('Start'));
    expect(window.localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe('1');
    // Το τελευταίο slide είναι το health-disclaimer — η ολοκλήρωση σφραγίζει το ack.
    expect(window.localStorage.getItem('anabasis.safety.ack')).toBe('1');
  });

  it('μεταφράζει τα RUNG/ALTITUDE labels από το εκάστοτε locale', async () => {
    await i18next.changeLanguage('el');
    render(wrap(<OnboardingOverlay />));
    expect(screen.getAllByText('ΣΚΑΛΙ 01').length).toBeGreaterThan(0);
    expect(screen.getByText('ΥΨΟΜΕΤΡΟ')).toBeTruthy();
  });
});
