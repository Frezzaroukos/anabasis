// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { SAFETY_ACK_KEY, hasSafetyAck, setSafetyAck } from './safety';

// Node 26+ ορίζει δικό του (πειραματικό, ανενεργό) global localStorage που
// σκιάζει το jsdom's window.localStorage· in-memory polyfill ώστε το test να
// είναι deterministic ανεξαρτήτως Node version (ίδιο pattern με το onboarding).
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

afterEach(() => {
  window.localStorage.clear();
});

describe('safety acknowledgement', () => {
  it('is false before the user accepts', () => {
    expect(hasSafetyAck()).toBe(false);
  });

  it('persists the acknowledgement locally', () => {
    setSafetyAck();
    expect(hasSafetyAck()).toBe(true);
    expect(window.localStorage.getItem(SAFETY_ACK_KEY)).toBe('1');
  });

  it('treats any non-"1" value as not acknowledged', () => {
    window.localStorage.setItem(SAFETY_ACK_KEY, 'yes');
    expect(hasSafetyAck()).toBe(false);
  });
});
