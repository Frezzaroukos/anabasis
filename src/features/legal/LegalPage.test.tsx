import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '@/i18n/en.json';
import el from '@/i18n/el.json';
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

/** Τα κείμενα πρέπει να λένε ό,τι κάνει ΟΝΤΩΣ ο κώδικας (live Stripe πληρωμές κ.λπ.) — όχι «προσωπικό, μη εμπορικό project». */
interface LegalDoc {
  title: string;
  intro: string;
  sections: { h: string; p: string }[];
}

const LEGAL_DOCS = ['privacy', 'terms', 'refund', 'safety'] as const;
type LegalKind = (typeof LEGAL_DOCS)[number];

function getDoc(loc: { legal: Record<LegalKind, LegalDoc> }, kind: LegalKind): LegalDoc {
  return loc.legal[kind];
}

function fullText(loc: { legal: Record<LegalKind, LegalDoc> }): string {
  return LEGAL_DOCS.flatMap((k) => {
    const doc = getDoc(loc, k);
    return [doc.title, doc.intro, ...doc.sections.flatMap((s) => [s.h, s.p])];
  }).join('\n');
}

describe('legal policy accuracy', () => {
  it('keeps the same section count in EN and EL', () => {
    for (const kind of LEGAL_DOCS) {
      expect(getDoc(el, kind).sections.length).toBe(getDoc(en, kind).sections.length);
    }
  });

  it('names the controller and gives a contact email', () => {
    for (const loc of [en, el]) {
      expect(fullText(loc)).toContain('contact@axonos.dev');
    }
    expect(fullText(en)).toContain('Aggelos Frantzeskakis');
    expect(fullText(en)).toContain('Rethymno');
  });

  it('points to the Greek data-protection authority', () => {
    expect(fullText(en)).toContain('https://www.dpa.gr');
    expect(fullText(el)).toContain('https://www.dpa.gr');
  });

  it('discloses Stripe as the payment processor', () => {
    expect(fullText(en)).toContain('Stripe');
    expect(fullText(el)).toContain('Stripe');
  });

  it('contains no “non-commercial” framing', () => {
    expect(fullText(en).toLowerCase()).not.toContain('non-commercial');
    expect(fullText(el).toLowerCase()).not.toContain('μη εμπορικό');
  });

  it('contains no price amounts or currency symbol', () => {
    expect(fullText(en)).not.toContain('€');
    expect(fullText(el)).not.toContain('€');
  });

  it('does not name the person or a company “Frezzaroukos”/“AXON”', () => {
    expect(fullText(en).toLowerCase()).not.toContain('frezzaroukos');
    expect(fullText(el).toLowerCase()).not.toContain('φρεζζαρούκου');
    expect(fullText(en)).not.toContain('AXON');
    expect(fullText(en)).not.toContain('AXONOS');
    expect(fullText(el)).not.toContain('AXON');
    expect(fullText(el)).not.toContain('AXONOS');
  });
});

describe('legal contact email and content guards', () => {
  const CONTACT_DOCS = ['privacy', 'terms', 'refund'] as const;

  it('gives contact@axonos.dev in privacy, terms and refund, in EN and EL', () => {
    for (const loc of [en, el]) {
      for (const kind of CONTACT_DOCS) {
        const doc = getDoc(loc, kind);
        const text = [doc.title, doc.intro, ...doc.sections.flatMap((s) => [s.h, s.p])].join('\n');
        expect(text).toContain('contact@axonos.dev');
      }
    }
  });

  it('contains no “non-commercial” framing or the placeholder name “Frezzaroukos”', () => {
    for (const loc of [en, el]) {
      const text = fullText(loc).toLowerCase();
      expect(text).not.toContain('non-commercial');
      expect(text).not.toContain('μη εμπορικό');
      expect(text).not.toContain('frezzaroukos');
      expect(text).not.toContain('φρεζζαρούκου');
    }
  });
});
