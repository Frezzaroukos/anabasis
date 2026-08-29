import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapDB } from '../db/bootstrap';
import { DEFAULT_USER_ID, setCurrentUserId } from '../db/session';
import { initOAuthFragment } from './auth';
import { readStoredAuth } from './client';

/**
 * initOAuthFragment() — OAuth-redirect fragment (server oauth/google/callback
 * → `#oauth=<token>`, βλ. server/API-CONTRACT.md). Mocked fetch (ίδιο μοτίβο
 * με src/lib/sync/index.test.ts): ελέγχουμε το ΣΥΜΒΟΛΑΙΟ — fragment
 * καθαρίζεται πάντα πρώτα, StoredAuth γράφεται/καθαρίζεται σωστά — όχι το
 * πραγματικό δίκτυο.
 */

const ME_RESPONSE = {
  id: DEFAULT_USER_ID, // ίδιο μοτίβο με sync/index.test.ts: no-op migration.
  email: 'oauth@example.com',
  role: 'user' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  last_sync_at: null,
};

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(handlers: { me?: (call: FetchCall) => Response }): {
  fn: ReturnType<typeof vi.fn>;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const call: FetchCall = { url, init };
    calls.push(call);
    if (url.includes('/me')) return handlers.me ? handlers.me(call) : jsonResponse(ME_RESPONSE);
    if (url.includes('/sync/push')) return jsonResponse({ cursor: 1 });
    if (url.includes('/sync/pull')) return jsonResponse({ changes: [], cursor: 0, has_more: false });
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

/** Ίδιο polyfill με sync/index.test.ts — αυτό το vitest env δεν έχει πάντα
 * globalThis.localStorage έτοιμο για τα module-level stores. */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeAll(async () => {
  await bootstrapDB();
});

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage());
  setCurrentUserId(DEFAULT_USER_ID);
  window.location.hash = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('initOAuthFragment', () => {
  it('no-op όταν δεν υπάρχει #oauth= fragment — καθόλου fetch/localStorage write', async () => {
    const { fn } = stubFetch({});

    await initOAuthFragment();

    expect(fn).not.toHaveBeenCalled();
    expect(readStoredAuth()).toBeNull();
  });

  it('διαβάζει το token, καθαρίζει το fragment, και γράφει το StoredAuth από /api/me', async () => {
    window.location.hash = '#oauth=tok-abc-123';
    const { calls } = stubFetch({});

    await initOAuthFragment();

    expect(window.location.hash).toBe('');

    const stored = readStoredAuth();
    expect(stored?.token).toBe('tok-abc-123');
    expect(stored?.account.email).toBe('oauth@example.com');
    expect(stored?.account.id).toBe(DEFAULT_USER_ID);

    // Το /api/me στάλθηκε με το fragment token ως bearer.
    const meCall = calls.find((c) => c.url.includes('/me'));
    const authHeader = (meCall?.init?.headers as Record<string, string> | undefined)?.Authorization;
    expect(authHeader).toBe('Bearer tok-abc-123');
  });

  it('βρίσκει το token ανάμεσα σε άλλα fragment κομμάτια (π.χ. #foo=1&oauth=tok-xyz)', async () => {
    window.location.hash = '#foo=1&oauth=tok-xyz';
    stubFetch({});

    await initOAuthFragment();

    expect(readStoredAuth()?.token).toBe('tok-xyz');
  });

  it('καθαρίζει το pending token αν το /api/me αποτύχει (π.χ. ληγμένο token)', async () => {
    window.location.hash = '#oauth=bad-token';
    stubFetch({
      me: () => jsonResponse({ error: 'unauthorized', message: 'nope' }, 401),
    });

    await initOAuthFragment();

    expect(window.location.hash).toBe('');
    expect(readStoredAuth()).toBeNull();
  });
});
