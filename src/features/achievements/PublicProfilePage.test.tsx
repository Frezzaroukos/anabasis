import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import en from '@/i18n/en.json';
import { AUTH_CHANGED_EVENT } from '@/lib/api/client';
import { PublicProfilePage } from './PublicProfilePage';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
});

function stubStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
    clear: () => data.clear(),
  });
}

beforeEach(() => {
  stubStorage();
});

afterEach(() => {
  globalThis.localStorage?.removeItem('anabasis.auth');
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: null }));
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const profile = {
  username: 'bbb',
  display_name: 'Bob',
  level: 3,
  xp: 400,
  tier: 'ridge',
  altitude_m: 1200,
  badges: '[]',
  streak_days: 2,
  longest_streak_days: 5,
  account_id: 'account-b',
  friendship: null,
};

function renderPage() {
  return render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter initialEntries={['/u/bbb']}>
        <Routes>
          <Route path="/u/:username" element={<PublicProfilePage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('PublicProfilePage', () => {
  it('logged-out προφίλ δείχνει join CTA, όχι add-friend', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(profile)));
    renderPage();
    expect(await screen.findByText('Start your ascent')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add friend' })).toBeNull();
  });

  it('logged-in μπορεί να στείλει αίτημα από το δημόσιο προφίλ', async () => {
    globalThis.localStorage.setItem(
      'anabasis.auth',
      JSON.stringify({
        token: 'test-token',
        account: {
          id: 'account-a',
          email: 'a@example.com',
          role: 'user',
          created_at: '2026-01-01T00:00:00Z',
        },
      }),
    );
    window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: null }));

    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      if (String(input).includes('/social/requests')) {
        return jsonResponse({ status: 'pending' });
      }
      return jsonResponse(profile);
    });
    vi.stubGlobal('fetch', fetchFn);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add friend' }));

    expect(await screen.findByText('Request sent')).toBeTruthy();
    await waitFor(() => {
      const call = fetchFn.mock.calls.find(([url]) => String(url).includes('/social/requests'));
      expect(call).toBeTruthy();
      expect(String(call![1]?.body)).toContain('"username":"bbb"');
    });
  });
});
