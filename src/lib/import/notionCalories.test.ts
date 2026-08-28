import { describe, expect, it } from 'vitest';
import { parseNotionCalories } from './notionCalories';

describe('parseNotionCalories', () => {
  it('παίρνει τον μήνα από το header, όχι από το (λάθος) date-string', () => {
    // Ο Ιανουάριος στο Notion γράφει λάθος «01-12-2025» — ο header είναι η αλήθεια.
    // startYear=2026 δηλώνεται από τον χρήστη (year picker) όταν το paste
    // ξεκινά μέσα στο 2026 χωρίς προηγούμενο Δεκέμβριο για rollover.
    const text = `
Ιανουάριος:
- [x] 01-12-2025:3300
- [x] 02-12-2025:3500
`;
    const { rows } = parseNotionCalories(text, 2026);
    expect(rows[0]!.date).toBe('2026-01-01'); // μήνας από header, όχι date-string
    expect(rows[0]!.calories).toBe(3300);
    expect(rows[1]!.date).toBe('2026-01-02');
  });

  it('χειρίζεται καθαρές τιμές, «2.500» (χιλιάδες) και «~4000»', () => {
    const text = `
Οκτώβριος:
- [x] 04-10-2025:2500
- [x] 05-10-2025: 2.500
- [x] 06-10-2025: ~4000
`;
    const { rows } = parseNotionCalories(text);
    expect(rows.map((r) => r.calories)).toEqual([2500, 2500, 4000]);
  });

  it('παίρνει τον αριθμό μετά το τελευταίο «=» σε math expression', () => {
    const text = `
Σεπτέμβριος:
- [x] 23-09-2025:3000-500=2.500
`;
    const { rows } = parseNotionCalories(text);
    expect(rows[0]!.calories).toBe(2500);
  });

  it('κόβει τα σχόλια «πάω X στις Y»', () => {
    const text = `
Σεπτέμβριος:
- [x] 22-09-2025:700+1500=2200+800=3.000 και πάω 500 στις 24 άρα 2500
`;
    const { rows } = parseNotionCalories(text);
    // κρατά το total πριν το «πάω» (3000), όχι το 2500 της μεταφοράς
    expect(rows[0]!.calories).toBe(3000);
    expect(rows[0]!.needsReview).toBe(true); // πολύπλοκο → σημαδεμένο
  });

  it('σημαδεύει τιμές εκτός λογικού εύρους για έλεγχο', () => {
    const text = `
Μάρτιος:
- [x] 05-03-2026:250
`;
    const { rows } = parseNotionCalories(text);
    expect(rows[0]!.calories).toBe(250);
    expect(rows[0]!.needsReview).toBe(true); // <800 = ύποπτο (μάλλον typo)
  });

  it('αυξάνει το έτος στο πέρασμα Δεκ→Ιαν', () => {
    const text = `
Δεκέμβριος:
- [x] 31-12-2025:3500
Ιανουάριος:
- [x] 01-01-2026:3300
`;
    const { rows } = parseNotionCalories(text);
    expect(rows[0]!.date).toBe('2025-12-31');
    expect(rows[1]!.date).toBe('2026-01-01');
  });

  it('κρατά μία τιμή ανά μέρα (πρώτη εμφάνιση)', () => {
    const text = `
Μάιος:
- [x] 01-05-2026:2250
- [x] 01-05-2026:9999
`;
    const { rows } = parseNotionCalories(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.calories).toBe(2250);
  });

  it('αγνοεί γραμμές χωρίς μήνα-header από πάνω', () => {
    const text = `- [x] 01-01-2026:3300`;
    const { rows } = parseNotionCalories(text);
    expect(rows).toHaveLength(0);
  });

  it('αδύνατη ημερομηνία (31 Φεβρουαρίου) → invalidDate, όχι σιωπηλό import', () => {
    // Πριν: το «2025-02-31» περνούσε ατόφιο στα body_metrics — μια μέρα
    // που δεν υπάρχει. Τώρα σημαδεύεται και το UI την αποκλείει.
    const text = `
Φεβρουάριος:
- [x] 28-02-2025:2500
- [x] 31-02-2025:2600
`;
    const { rows } = parseNotionCalories(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.invalidDate).toBe(false);
    expect(rows[0]!.needsReview).toBe(false);
    expect(rows[1]!.date).toBe('2025-02-31');
    expect(rows[1]!.invalidDate).toBe(true);
    expect(rows[1]!.needsReview).toBe(true);
  });

  it('η 29η Φεβρουαρίου ισχύει ΜΟΝΟ σε δίσεκτα έτη', () => {
    const leap = parseNotionCalories('Φεβρουάριος:\n- [x] 29-02-2024:2500', 2024);
    expect(leap.rows[0]!.invalidDate).toBe(false);
    const nonLeap = parseNotionCalories('Φεβρουάριος:\n- [x] 29-02-2025:2500', 2025);
    expect(nonLeap.rows[0]!.invalidDate).toBe(true);
  });

  it('η αδύνατη ημερομηνία δεν «καίει» τη θέση της πραγματικής στο dedup', () => {
    const text = `
Απρίλιος:
- [x] 31-04-2026:2600
- [x] 30-04-2026:2400
`;
    const { rows } = parseNotionCalories(text, 2026);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.date === '2026-04-30')!.invalidDate).toBe(false);
  });
});
