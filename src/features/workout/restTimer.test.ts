import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetRestTimer,
  adjustRest,
  clampRestSeconds,
  formatRest,
  remainingSeconds,
  restoreRest,
  setRestFinishHandler,
  startRest,
  stopRest,
} from './restTimer';

// Node 26+ ορίζει δικό του global localStorage που σκιάζει του jsdom — in-memory
// polyfill (ίδιο pattern με useManualStopwatch.test).
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
  configurable: true,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-22T10:00:00Z'));
  globalThis.localStorage?.clear();
  __resetRestTimer();
});

afterEach(() => {
  __resetRestTimer();
  vi.useRealTimers();
});

describe('restTimer', () => {
  it('formats m:ss', () => {
    expect(formatRest(0)).toBe('0:00');
    expect(formatRest(65)).toBe('1:05');
    expect(formatRest(180)).toBe('3:00');
  });

  it('clamps to 5s..1h and survives NaN', () => {
    expect(clampRestSeconds(1)).toBe(5);
    expect(clampRestSeconds(99999)).toBe(3600);
    expect(clampRestSeconds(Number.NaN)).toBe(5);
  });

  it('counts down against wall-clock time and fires the finish handler once', () => {
    const done = vi.fn();
    setRestFinishHandler(done);
    startRest(30);
    expect(remainingSeconds()).toBe(30);
    vi.advanceTimersByTime(20_000);
    expect(remainingSeconds()).toBe(10);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_500);
    expect(done).toHaveBeenCalledTimes(1);
    expect(remainingSeconds()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('adjusts the running rest and ignores adjust when idle', () => {
    adjustRest(15);
    expect(remainingSeconds()).toBe(0);
    startRest(60);
    vi.advanceTimersByTime(10_000);
    adjustRest(15);
    expect(remainingSeconds()).toBe(65);
    adjustRest(-15);
    expect(remainingSeconds()).toBe(50);
  });

  it('stop cancels the countdown without firing the handler', () => {
    const done = vi.fn();
    setRestFinishHandler(done);
    startRest(30);
    stopRest();
    vi.advanceTimersByTime(60_000);
    expect(done).not.toHaveBeenCalled();
    expect(remainingSeconds()).toBe(0);
  });

  it('restores a still-running rest after a refresh, drops an expired one', () => {
    startRest(120);
    // «refresh»: το module state χάνεται, το localStorage μένει.
    const saved = globalThis.localStorage.getItem('anabasis.restEndsAt');
    expect(saved).not.toBeNull();
    __resetRestTimer();
    globalThis.localStorage.setItem('anabasis.restEndsAt', saved!);
    vi.advanceTimersByTime(30_000);
    restoreRest();
    expect(remainingSeconds()).toBe(90);

    __resetRestTimer();
    globalThis.localStorage.setItem('anabasis.restEndsAt', saved!);
    vi.advanceTimersByTime(200_000);
    restoreRest();
    expect(remainingSeconds()).toBe(0);
    expect(globalThis.localStorage.getItem('anabasis.restEndsAt')).toBeNull();
  });
});
