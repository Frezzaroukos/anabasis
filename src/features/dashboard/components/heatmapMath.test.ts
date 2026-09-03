import { describe, expect, it } from 'vitest';
import { alignToWeekday, chunkIntoWeeks } from './heatmapMath';
import type { HeatCell } from '@/lib/db/queries';

function cell(date: string): HeatCell {
  return { date, trained: false, hasPR: false };
}

describe('alignToWeekday', () => {
  it('άδεια λίστα → άδεια', () => {
    expect(alignToWeekday([])).toEqual([]);
  });

  it('ξεκινά Δευτέρα → καθόλου padding', () => {
    // 2026-08-31 είναι Δευτέρα.
    const cells = [cell('2026-08-31'), cell('2026-09-01')];
    expect(alignToWeekday(cells)).toEqual(cells);
  });

  it('ξεκινά Τετάρτη → 2 κενά πριν (Δευτ, Τρι)', () => {
    // 2026-09-02 είναι Τετάρτη.
    const cells = [cell('2026-09-02')];
    const aligned = alignToWeekday(cells);
    expect(aligned).toEqual([null, null, cell('2026-09-02')]);
  });

  it('ξεκινά Κυριακή → 6 κενά πριν (η Κυριακή είναι η τελευταία γραμμή)', () => {
    // 2026-09-06 είναι Κυριακή.
    const cells = [cell('2026-09-06')];
    const aligned = alignToWeekday(cells);
    expect(aligned).toHaveLength(7);
    expect(aligned.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(aligned[6]).toEqual(cell('2026-09-06'));
  });
});

describe('chunkIntoWeeks', () => {
  it('χωρίζει σε στήλες των 7, με ημιτελή τελευταία στήλη αν χρειάζεται', () => {
    const aligned = [null, cell('a'), cell('b'), cell('c'), cell('d'), cell('e'), cell('f'), cell('g')];
    const weeks = chunkIntoWeeks(aligned);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toHaveLength(7);
    expect(weeks[1]).toEqual([cell('g')]);
  });

  it('91 ημέρες ήδη ευθυγραμμισμένες (πολλαπλάσιο του 7) → ακριβώς 13 στήλες', () => {
    const cells = Array.from({ length: 91 }, (_, i) => cell(`day-${i}`));
    const weeks = chunkIntoWeeks(cells);
    expect(weeks).toHaveLength(13);
    for (const w of weeks) expect(w).toHaveLength(7);
  });
});
