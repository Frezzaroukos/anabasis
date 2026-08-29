import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import en from '@/i18n/en.json';
import { AccountCard } from './AccountCard';

/**
 * Providers-gating (GET /api/auth/oauth/providers) στο signed-out κουμπί
 * Google — config-gated feature, βλ. server/API-CONTRACT.md. Το i18n key
 * `account.continueWithGoogle` δεν υπάρχει ακόμα στα i18n/*.json (out of
 * scope εδώ, βλ. report) — i18next κάνει fallback στο ίδιο το key, που
 * περιέχει τη λέξη "Google" ούτως ή άλλως, οπότε ένα case-insensitive
 * `/google/i` match μένει σωστό ΚΑΙ πριν ΚΑΙ μετά την προσθήκη της μετάφρασης.
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

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderCard() {
  return render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter>
        <AccountCard />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function googleButton() {
  return screen.queryByRole('button', { name: /google/i });
}

describe('AccountCard — signed-out Google button gating', () => {
  it('κρυμμένο όσο εκκρεμεί η απάντηση του /api/auth/oauth/providers', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})), // ποτέ δεν λύνεται
    );
    renderCard();
    expect(googleButton()).toBeNull();
  });

  it('εμφανίζεται όταν ο server αναφέρει {google: true}', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ google: true })));
    renderCard();
    await waitFor(() => expect(googleButton()).not.toBeNull());
  });

  it('μένει κρυμμένο όταν ο server αναφέρει {google: false} (δεν έχει configured Google credentials)', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ google: false }));
    vi.stubGlobal('fetch', fetchFn);
    renderCard();
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    expect(googleButton()).toBeNull();
  });

  it('μένει κρυμμένο σιωπηλά σε network error (όχι crash)', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchFn);
    renderCard();
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    expect(googleButton()).toBeNull();
  });
});
