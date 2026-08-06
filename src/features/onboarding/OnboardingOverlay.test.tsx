import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
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

// Τα onboarding.* keys δεν υπάρχουν ακόμα στο en.json/el.json (θα προστεθούν
// χωριστά) — εδώ τα προσθέτουμε inline στο test resource, όπως ζητήθηκε.
const RESOURCE = {
  ...en,
  onboarding: {
    title: 'Welcome to Anabasis',
    skip: 'Skip',
    next: 'Next',
    start: 'Start',
    slide1: { title: 'Welcome to Anabasis', desc: 'The map of your ascent.' },
    slide2: { title: 'Not just another gym app', desc: 'Log weights and skill progressions.' },
    slide3: { title: 'Local-first', desc: 'Your data, works offline. Start.' },
  },
};

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: { en: { translation: RESOURCE } },
    interpolation: { escapeValue: false },
  });
});

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

const wrap = (ui: React.ReactNode) => <I18nextProvider i18n={i18next}>{ui}</I18nextProvider>;

describe('OnboardingOverlay', () => {
  it('εμφανίζεται όταν δεν υπάρχει το window.localStorage flag', () => {
    render(wrap(<OnboardingOverlay />));
    expect(screen.getByText('Welcome to Anabasis')).toBeTruthy();
  });

  it('δεν εμφανίζεται αν έχει ήδη γίνει onboard', () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    render(wrap(<OnboardingOverlay />));
    expect(screen.queryByText('Welcome to Anabasis')).toBeNull();
  });

  it('«Παράλειψη» κλείνει το overlay και γράφει το flag', () => {
    render(wrap(<OnboardingOverlay />));
    fireEvent.click(screen.getByText('Skip'));
    expect(screen.queryByText('Welcome to Anabasis')).toBeNull();
    expect(window.localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe('1');
  });

  it('προχωράει στα slides και ολοκληρώνει στο τελευταίο', () => {
    render(wrap(<OnboardingOverlay />));
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Not just another gym app')).toBeTruthy();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Local-first')).toBeTruthy();
    fireEvent.click(screen.getByText('Start'));
    expect(window.localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe('1');
  });
});
