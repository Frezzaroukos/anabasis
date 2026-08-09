import { describe, expect, it } from 'vitest';
import { DASHBOARD_CARD_KEYS, LOCKED_VISIBLE, resolveCardOrder } from './cards';

/**
 * Ο resolver είναι το σημείο όπου «οι προτιμήσεις του χρήστη» συναντούν «το
 * τι υπάρχει σήμερα στον κώδικα». Κάθε test εδώ αντιστοιχεί σε μια αλλαγή
 * που ΘΑ γίνει κάποτε: νέα κάρτα, κάρτα που καταργήθηκε, χαλασμένα δεδομένα.
 */
describe('resolveCardOrder', () => {
  it('χωρίς προτιμήσεις: όλες οι κάρτες, ορατές, στην προεπιλεγμένη σειρά', () => {
    const out = resolveCardOrder(undefined);
    expect(out.map((c) => c.key)).toEqual([...DASHBOARD_CARD_KEYS]);
    expect(out.every((c) => c.visible)).toBe(true);
  });

  it('κρατά τη σειρά του χρήστη', () => {
    const out = resolveCardOrder([
      { key: 'prs', visible: true },
      { key: 'goals', visible: true },
    ]);
    expect(out.slice(0, 2).map((c) => c.key)).toEqual(['prs', 'goals']);
  });

  it('νέα κάρτα του κώδικα μπαίνει στο τέλος ΟΡΑΤΗ, όχι κρυμμένη', () => {
    // Ο χρήστης είχε αποθηκεύσει προτιμήσεις πριν υπάρξει η κάρτα «goals».
    const prefs = DASHBOARD_CARD_KEYS.filter((k) => k !== 'goals').map((key) => ({
      key,
      visible: true,
    }));
    const out = resolveCardOrder(prefs);
    const goals = out.find((c) => c.key === 'goals');
    expect(goals).toBeDefined();
    expect(goals!.visible).toBe(true);
    expect(out.at(-1)!.key).toBe('goals');
  });

  it('αγνοεί κλειδιά που δεν υπάρχουν πια', () => {
    const out = resolveCardOrder([
      { key: 'καταργημένη-κάρτα', visible: true },
      { key: 'prs', visible: false },
    ]);
    expect(out.some((c) => c.key === 'καταργημένη-κάρτα')).toBe(false);
    expect(out.find((c) => c.key === 'prs')!.visible).toBe(false);
  });

  it('αγνοεί διπλοεγγραφές του ίδιου κλειδιού', () => {
    const out = resolveCardOrder([
      { key: 'prs', visible: false },
      { key: 'prs', visible: true },
    ]);
    expect(out.filter((c) => c.key === 'prs')).toHaveLength(1);
    expect(out[0]!.visible).toBe(false);
  });

  it('οι κλειδωμένες κάρτες μένουν ορατές ακόμα κι αν τα δεδομένα λένε αλλιώς', () => {
    // Διαφορετικά μια χαλασμένη/παλιά εγγραφή θα άφηνε την Αρχική χωρίς
    // τρόπο να ξεκινήσεις προπόνηση — αδιέξοδο από ρύθμιση.
    const locked = LOCKED_VISIBLE[0]!;
    const out = resolveCardOrder([{ key: locked, visible: false }]);
    expect(out.find((c) => c.key === locked)!.visible).toBe(true);
  });

  it('επιστρέφει πάντα ΟΛΑ τα υπαρκτά κλειδιά', () => {
    const out = resolveCardOrder([{ key: 'body', visible: false }]);
    expect(out).toHaveLength(DASHBOARD_CARD_KEYS.length);
  });
});
