import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus trap για modal/sheet (WAI-ARIA APG dialog pattern): όταν ανοίγει,
 * μεταφέρει το focus μέσα στο container· όσο είναι ανοιχτό, το Tab/Shift+Tab
 * παγιδεύεται εκεί μέσα (δεν "διαφεύγει" στο περιεχόμενο πίσω από το backdrop)·
 * όταν κλείνει, επαναφέρει το focus στο στοιχείο που το είχε πριν (συνήθως το
 * κουμπί που άνοιξε το modal) — χωρίς αυτό, ένας χρήστης πληκτρολογίου/
 * screen-reader "χανόταν" μόλις έκλεινε ένα sheet/dialog.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    const first = focusables()[0];
    (first ?? container).focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    container.addEventListener('keydown', onKeyDown);

    return () => {
      container.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.({ preventScroll: true });
    };
  }, [active, containerRef]);
}
