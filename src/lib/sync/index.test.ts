import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { bootstrapDB } from '../db/bootstrap';
import { DEFAULT_USER_ID, setCurrentUserId } from '../db/session';
import { createExercise } from '../db/queries';
import { fullResync, syncNow } from './index';

/**
 * Sync engine — mocked fetch (vi.stubGlobal). Ελέγχουμε το ΣΥΜΒΟΛΑΙΟ, όχι τον
 * (ανύπαρκτο ακόμα) πραγματικό server: σχήμα αιτημάτων, φιλτράρισμα στον
 * τρέχοντα χρήστη, has_more drain, 401 → σιωπηλό sign-out, offline → cursors
 * ανέγγιχτα.
 */

const ACCOUNT = {
  id: DEFAULT_USER_ID,
  email: 'lifter@example.com',
  role: 'user' as const,
  created_at: '2026-01-01T00:00:00.000Z',
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

function stubFetch(handlers: {
  push?: (call: FetchCall) => Response;
  pull?: (call: FetchCall) => Response;
}): { fn: ReturnType<typeof vi.fn>; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const call: FetchCall = { url, init };
    calls.push(call);
    if (url.includes('/sync/push')) {
      return handlers.push ? handlers.push(call) : jsonResponse({ cursor: 1 });
    }
    if (url.includes('/sync/pull')) {
      return handlers.pull ? handlers.pull(call) : jsonResponse({ changes: [], cursor: 0, has_more: false });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

function body(call: FetchCall): Record<string, unknown> {
  return JSON.parse(call.init?.body as string) as Record<string, unknown>;
}

/**
 * Αυτό το vitest env δεν έχει globalThis.localStorage (Node 26 experimental
 * global, jsdom δεν το γεμίζει χωρίς `url`) — ίδιος λόγος που session.ts/
 * theme.ts/client.ts διαβάζουν πάντα μέσω optional chaining. Το sync/auth
 * layer ΒΑΣΙΖΕΤΑΙ σε πραγματικό localStorage behaviour, οπότε stub εδώ.
 */
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
  localStorage.setItem('anabasis.auth', JSON.stringify({ token: 'tok-123', account: ACCOUNT }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('syncNow — push', () => {
  it('στέλνει μόνο rows του τρέχοντος χρήστη, με το σωστό σχήμα ({ changes: [{ tbl, rows }] })', async () => {
    await createExercise({ name: 'Sync Test Exercise' });
    const { calls } = stubFetch({});

    await syncNow();

    const pushCall = calls.find((c) => c.url.includes('/sync/push'));
    expect(pushCall).toBeTruthy();
    expect(pushCall!.init?.headers).toMatchObject({ Authorization: 'Bearer tok-123' });

    const req = body(pushCall!);
    expect(Array.isArray(req.changes)).toBe(true);
    const changes = req.changes as Array<{ tbl: string; rows: Array<Record<string, unknown>> }>;
    const exercises = changes.find((c) => c.tbl === 'exercises');
    expect(exercises).toBeTruthy();
    expect(exercises!.rows.some((r) => r.name === 'Sync Test Exercise')).toBe(true);
    for (const change of changes) {
      for (const row of change.rows) {
        // 'users': το PK είναι id, δεν κουβαλά δικό του user_id.
        if (change.tbl === 'users') expect(row.id).toBe(DEFAULT_USER_ID);
        else expect(row.user_id).toBe(DEFAULT_USER_ID);
      }
    }
  });
});

describe('syncNow — pull', () => {
  it('εφαρμόζει rows ΚΑΙ tombstones, προχωρά τον cursor', async () => {
    const normalId = 'sync-pull-normal';
    const tombstoneId = 'sync-pull-tombstone';
    stubFetch({
      pull: () =>
        jsonResponse({
          changes: [
            {
              tbl: 'exercises',
              rows: [
                {
                  id: normalId,
                  user_id: DEFAULT_USER_ID,
                  name: 'Pulled Exercise',
                  category: 'other',
                  movement_type: 'compound',
                  equipment: [],
                  is_weighted: true,
                  is_bodyweight: false,
                  default_unit: 'kg',
                  notes: null,
                  is_archived: false,
                  created_at: '2026-01-01T00:00:00.000Z',
                  updated_at: '2026-01-01T00:00:00.000Z',
                  deleted_at: null,
                },
                {
                  id: tombstoneId,
                  user_id: DEFAULT_USER_ID,
                  name: 'Deleted elsewhere',
                  category: 'other',
                  movement_type: 'compound',
                  equipment: [],
                  is_weighted: true,
                  is_bodyweight: false,
                  default_unit: 'kg',
                  notes: null,
                  is_archived: false,
                  created_at: '2026-01-01T00:00:00.000Z',
                  updated_at: '2026-01-02T00:00:00.000Z',
                  deleted_at: '2026-01-02T00:00:00.000Z',
                },
              ],
            },
          ],
          cursor: 42,
          has_more: false,
        }),
    });

    await syncNow();

    const applied = await db.exercises.get(normalId);
    expect(applied?.name).toBe('Pulled Exercise');
    const tombstone = await db.exercises.get(tombstoneId);
    expect(tombstone?.deleted_at).toBe('2026-01-02T00:00:00.000Z');

    const cursors = JSON.parse(localStorage.getItem('anabasis.sync')!) as { pullCursor: number };
    expect(cursors.pullCursor).toBe(42);
  });

  it('ακολουθεί has_more μέχρι να αδειάσει', async () => {
    let pullCalls = 0;
    const { calls } = stubFetch({
      pull: () => {
        pullCalls += 1;
        return pullCalls === 1
          ? jsonResponse({ changes: [], cursor: 5, has_more: true })
          : jsonResponse({ changes: [], cursor: 10, has_more: false });
      },
    });

    await syncNow();

    const pullReqs = calls.filter((c) => c.url.includes('/sync/pull'));
    expect(pullReqs).toHaveLength(2);
    expect(body(pullReqs[0]!)).toMatchObject({ cursor: 0 });
    expect(body(pullReqs[1]!)).toMatchObject({ cursor: 5 });

    const cursors = JSON.parse(localStorage.getItem('anabasis.sync')!) as { pullCursor: number };
    expect(cursors.pullCursor).toBe(10);
  });
});

describe('σφάλματα δικτύου', () => {
  it('401 κατά το sync κάνει σιωπηλό sign-out (καθαρίζει localStorage, δεν πετάει)', async () => {
    stubFetch({
      push: () => jsonResponse({ error: 'expired_token', message: 'Token expired' }, 401),
    });

    await expect(syncNow()).resolves.toBeUndefined();
    expect(localStorage.getItem('anabasis.auth')).toBeNull();
  });

  it('offline (fetch reject) αφήνει τα cursors ανέγγιχτα', async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fn);

    await expect(syncNow()).resolves.toBeUndefined();
    expect(localStorage.getItem('anabasis.sync')).toBeNull();
  });
});

describe('fullResync', () => {
  it('σπρώχνει τα πάντα (χωρίς cutoff) και ξεκινά pull από cursor 0', async () => {
    await createExercise({ name: 'Full Resync Exercise' });
    const { calls } = stubFetch({});

    await fullResync();

    const pullReq = calls.find((c) => c.url.includes('/sync/pull'));
    expect(body(pullReq!)).toMatchObject({ cursor: 0 });

    const cursors = JSON.parse(localStorage.getItem('anabasis.sync')!) as { pullCursor: number };
    expect(cursors.pullCursor).toBe(0);
  });
});

describe('epoch (restore-desync protection)', () => {
  it('σε αλλαγή epoch: μηδενίζει cursor, ξανασπρώχνει όλα, ξανακατεβάζει από 0', async () => {
    // 1ο sync: server epoch 'aaa' — αποθηκεύεται.
    stubFetch({
      pull: () => jsonResponse({ changes: [], cursor: 7, has_more: false, epoch: 'aaa' }),
    });
    await syncNow();
    expect(JSON.parse(localStorage.getItem('anabasis.sync')!)).toMatchObject({
      epoch: 'aaa',
      pullCursor: 7,
    });

    // 2ο sync: ο server έχει γίνει restore — νέο epoch 'bbb'. Πρέπει: push-all
    // + pull από 0, ΟΧΙ pull από τον νεκρό cursor 7.
    await createExercise({ name: 'Epoch Test Lift' });
    const pullCursors: number[] = [];
    const { calls } = stubFetch({
      pull: (call) => {
        const cursor = (JSON.parse(String(call.init?.body)) as { cursor: number }).cursor;
        pullCursors.push(cursor);
        // Πρώτη απάντηση με το νέο epoch πυροδοτεί το reset· μετά ήσυχα.
        return jsonResponse({ changes: [], cursor: 9, has_more: false, epoch: 'bbb' });
      },
    });
    await syncNow();

    const pushes = calls.filter((c) => c.url.includes('/sync/push'));
    expect(pushes.length).toBeGreaterThan(0); // ξανασπρώχτηκαν τα πάντα
    expect(pullCursors).toContain(0); // και το κατέβασμα ξεκίνησε από 0
    expect(JSON.parse(localStorage.getItem('anabasis.sync')!)).toMatchObject({ epoch: 'bbb' });
  });
});
