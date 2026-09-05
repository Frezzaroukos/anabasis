// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readStopwatchSeconds, clearStopwatch } from './useManualStopwatch';

// Node 26+ ορίζει δικό του (πειραματικό) global localStorage που σκιάζει το
// jsdom's· in-memory polyfill ώστε το test να είναι deterministic (ίδιο pattern
// με το OnboardingOverlay.test).
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}
const mem = createMemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: mem, configurable: true });

const KEY = (id: string) => `anabasis.stopwatch.${id}`;

describe('useManualStopwatch persistence', () => {
  beforeEach(() => mem.clear());
  afterEach(() => vi.useRealTimers());

  it('readStopwatchSeconds: 0 όταν δεν έχει ξεκινήσει', () => {
    expect(readStopwatchSeconds('w1')).toBe(0);
  });

  it('readStopwatchSeconds: επιστρέφει τα συσσωρευμένα (paused) δευτερόλεπτα', () => {
    localStorage.setItem(KEY('w1'), JSON.stringify({ acc: 125_000, since: null }));
    expect(readStopwatchSeconds('w1')).toBe(125);
  });

  it('readStopwatchSeconds: προσθέτει τον live χρόνο όταν τρέχει', () => {
    vi.useFakeTimers();
    const now = Date.now();
    localStorage.setItem(KEY('w1'), JSON.stringify({ acc: 60_000, since: now - 40_000 }));
    // acc 60s + 40s live = 100s
    expect(readStopwatchSeconds('w1')).toBe(100);
  });

  it('clearStopwatch: σβήνει το state', () => {
    localStorage.setItem(KEY('w1'), JSON.stringify({ acc: 10_000, since: null }));
    clearStopwatch('w1');
    expect(readStopwatchSeconds('w1')).toBe(0);
    expect(localStorage.getItem(KEY('w1'))).toBeNull();
  });

  it('corrupt JSON → 0 (καμία εξαίρεση)', () => {
    localStorage.setItem(KEY('w1'), 'not json');
    expect(readStopwatchSeconds('w1')).toBe(0);
  });
});
