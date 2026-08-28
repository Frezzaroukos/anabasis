import { describe, expect, it } from 'vitest';
import { parseNotionWeights } from './notionWeights';

describe('parseNotionWeights', () => {
  it('διαβάζει δεκαδικά με κόμμα, τελεία και «kg» suffix', () => {
    const text = `
Οκτώβριος:
- [x] 04-10-2025: 71,5
- [x] 05-10-2025: 71.2
- [x] 06-10-2025: 70.8kg
- [x] 07-10-2025: ~71
`;
    const { rows } = parseNotionWeights(text);
    expect(rows.map((r) => r.weightKg)).toEqual([71.5, 71.2, 70.8, 71]);
    expect(rows.every((r) => !r.invalidDate)).toBe(true);
    expect(rows[0]!.date).toBe('2025-10-04');
  });

  it('ο μήνας έρχεται από το header, όχι από το (λάθος) date-string', () => {
    const text = `
Ιανουάριος:
- [x] 01-12-2025: 72,0
`;
    const { rows } = parseNotionWeights(text, 2026);
    expect(rows[0]!.date).toBe('2026-01-01');
  });

  it('τιμή εκτός λογικού εύρους βάρους σημαδεύεται για έλεγχο', () => {
    const text = `
Μάρτιος:
- [x] 05-03-2026: 7,1
`;
    const { rows } = parseNotionWeights(text);
    expect(rows[0]!.weightKg).toBe(7.1);
    expect(rows[0]!.needsReview).toBe(true); // <35kg = μάλλον typo
  });

  it('δεύτερος αριθμός στη γραμμή = ασαφής μέτρηση, σημαδεύεται', () => {
    const text = `
Μάιος:
- [x] 02-05-2026: 71,5 μετά το φαγητό 72,1
`;
    const { rows } = parseNotionWeights(text);
    expect(rows[0]!.weightKg).toBe(71.5);
    expect(rows[0]!.needsReview).toBe(true);
  });

  it('αδύνατη ημερομηνία (31 Φεβρουαρίου) σημαδεύεται invalidDate', () => {
    const text = `
Φεβρουάριος:
- [x] 28-02-2025: 71,0
- [x] 31-02-2025: 71,3
`;
    const { rows } = parseNotionWeights(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.invalidDate).toBe(false);
    expect(rows[1]!.invalidDate).toBe(true);
    expect(rows[1]!.needsReview).toBe(true);
  });

  it('κρατά μία τιμή ανά μέρα και αυξάνει έτος στο Δεκ→Ιαν', () => {
    const text = `
Δεκέμβριος:
- [x] 31-12-2025: 72
- [x] 31-12-2025: 99
Ιανουάριος:
- [x] 01-01-2026: 71,8
`;
    const { rows } = parseNotionWeights(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.date).toBe('2025-12-31');
    expect(rows[0]!.weightKg).toBe(72);
    expect(rows[1]!.date).toBe('2026-01-01');
  });

  it('γραμμές χωρίς μήνα-header από πάνω αγνοούνται', () => {
    const { rows } = parseNotionWeights('- [x] 01-01-2026: 71,5');
    expect(rows).toHaveLength(0);
  });
});
