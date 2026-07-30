import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWakeLock } from './useWakeLock';

describe('useWakeLock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as { wakeLock?: unknown }).wakeLock;
  });

  it('δεν πετάει σφάλμα όταν το Wake Lock API δεν υπάρχει', () => {
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });

  it('δεν ζητάει lock όταν active=false', () => {
    const request = vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    renderHook(() => useWakeLock(false));
    expect(request).not.toHaveBeenCalled();
  });

  it('ζητάει το lock όταν active=true και το API υπάρχει, και το κάνει release στο unmount', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    const { unmount } = renderHook(() => useWakeLock(true));
    // acquire() είναι async — δώσε χρόνο στο microtask queue
    await Promise.resolve();
    await Promise.resolve();
    expect(request).toHaveBeenCalledWith('screen');

    unmount();
    await Promise.resolve();
    expect(release).toHaveBeenCalled();
  });

  it('αγνοεί ήσυχα permission errors κατά το request', async () => {
    const request = vi.fn().mockRejectedValue(new Error('not allowed'));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
