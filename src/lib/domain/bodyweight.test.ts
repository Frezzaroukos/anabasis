import { describe, expect, it } from 'vitest';
import { resolveBodyweight } from './bodyweight';

const h = [
  { date: '2026-11-18', weight_kg: 82 },
  { date: '2026-12-20', weight_kg: 80 },
];

describe('resolveBodyweight', () => {
  it('τελευταία μέτρηση ΜΕΧΡΙ τη μέρα — ακριβής, όχι approximate', () => {
    expect(resolveBodyweight(h, '2026-11-18')).toEqual({ kg: 82, approximate: false });
    expect(resolveBodyweight(h, '2026-12-01')).toEqual({ kg: 82, approximate: false });
  });
  it('χωρίς προηγούμενη: πλησιέστερη μεταγενέστερη εντός 60 ημερών, σημαίνεται approximate', () => {
    expect(resolveBodyweight(h, '2026-10-01')).toEqual({ kg: 82, approximate: true }); // 48 μέρες
  });
  it('μεταγενέστερη πέρα από 60 ημέρες → τίποτα', () => {
    expect(resolveBodyweight(h, '2026-09-01')).toBeNull(); // 78 μέρες
  });
  it('60 ημέρες ακριβώς μπαίνει, 61 όχι', () => {
    expect(resolveBodyweight(h, '2026-09-19')).toEqual({ kg: 82, approximate: true });
    expect(resolveBodyweight(h, '2026-09-18')).toBeNull();
  });
  it('κενό ιστορικό / μετρήσεις χωρίς βάρος → null', () => {
    expect(resolveBodyweight([], '2026-11-18')).toBeNull();
    expect(resolveBodyweight([{ date: '2026-11-18', weight_kg: null }], '2026-11-20')).toBeNull();
  });
});
