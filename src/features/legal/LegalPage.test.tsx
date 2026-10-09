import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '@/i18n/en.json';
import { LegalPage } from './LegalPage';
import { SAFETY_ACK_KEY } from '@/lib/safety';

// Node 26+ σκιάζει το jsdom window.localStorage· in-memory polyfill (ίδιο
// pattern με το onboarding test) ώστε το ack να είναι deterministic.
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

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});

beforeEach(() => {
  window.localStorage.clear();
});

const renderAt = (path: string) =>
  render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/legal/:doc" element={<LegalPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );

describe('LegalPage', () => {
  it('renders the privacy policy with its sections', () => {
    renderAt('/legal/privacy');
    expect(screen.getByText(en.legal.privacy.title)).toBeTruthy();
    expect(screen.getByText(en.legal.privacy.sections[0]!.h)).toBeTruthy();
  });

  it('renders the terms of service', () => {
    renderAt('/legal/terms');
    expect(screen.getByText(en.legal.terms.title)).toBeTruthy();
  });

  it('lets the user acknowledge the safety notice and persists it', () => {
    renderAt('/legal/safety');
    expect(screen.getByText(en.legal.safety.title)).toBeTruthy();
    expect(window.localStorage.getItem(SAFETY_ACK_KEY)).toBeNull();
    fireEvent.click(screen.getByText(en.legal.safety.accept));
    expect(window.localStorage.getItem(SAFETY_ACK_KEY)).toBe('1');
    expect(screen.getByText(en.legal.safety.acked)).toBeTruthy();
  });
});
