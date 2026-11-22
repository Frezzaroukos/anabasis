import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportFileDate } from '../exportFileDate';

/**
 * Audit #18: το όνομα του backup χρησιμοποιούσε `new Date().toISOString()` =
 * UTC μέρα. Μεταξύ 00:00 και 02:00/03:00 τοπική (Αθήνα) το αρχείο έπαιρνε τη
 * χθεσινή ημερομηνία. Το helper επιστρέφει την ΤΟΠΙΚΗ ημέρα.
 */
beforeEach(() => {
  vi.stubEnv('TZ', 'Europe/Athens');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('exportFileDate', () => {
  it('23:30Z = 01:30 επόμενης μέρας στην Αθήνα → τοπική μέρα', () => {
    const date = new Date('2026-11-21T23:30:00.000Z');
    // Το παλιό UTC slice θα έδινε 2026-11-21.
    expect(date.toISOString().slice(0, 10)).toBe('2026-11-21');
    expect(exportFileDate(date)).toBe('2026-11-22');
  });

  it('μέση ημέρας → ίδια ημέρα', () => {
    expect(exportFileDate(new Date('2026-11-21T12:00:00.000Z'))).toBe('2026-11-21');
  });
});
