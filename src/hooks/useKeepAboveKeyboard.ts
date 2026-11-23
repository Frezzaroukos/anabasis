import { useEffect, type RefObject } from 'react';
import { hiddenBelowViewport } from '@/lib/touch';

/** Το πλησιέστερο πρόγονο που κάνει κάθετο scroll (ή το document). */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

/**
 * Όταν γράφεις σε ένα πεδίο μέσα στο `containerRef` και ανοίγει το soft
 * keyboard, ο browser φροντίζει να φαίνεται το ΠΕΔΙΟ — όχι το κουμπί κάτω από
 * αυτό. Στο γυμναστήριο αυτό σήμαινε: γράφεις επαναλήψεις, το «Προσθήκη set»
 * κρύβεται πίσω από το πληκτρολόγιο, κλείνεις το πληκτρολόγιο, μετά πατάς.
 *
 * Ακούμε το visualViewport (το μόνο API που ξέρει το ύψος του πληκτρολογίου,
 * σε Android ΚΑΙ iOS) και, αν το `targetRef` έχει χαθεί από κάτω, κυλάμε τον
 * πλησιέστερο scroll container ακριβώς όσο χρειάζεται. Αν φαίνεται ήδη, δεν
 * κάνουμε τίποτα — δεν «παλεύουμε» με το δικό του scroll του browser.
 */
export function useKeepAboveKeyboard(
  containerRef: RefObject<HTMLElement | null>,
  targetRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const container = containerRef.current;
    const vv = globalThis.visualViewport;
    if (!container || !vv) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const reveal = () => {
      const target = targetRef.current;
      const active = document.activeElement;
      if (!target || !active || !container.contains(active)) return;
      if (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA') return;
      const hidden = hiddenBelowViewport(target.getBoundingClientRect().bottom, vv);
      if (hidden <= 0) return;
      scrollParentOf(target)?.scrollBy({ top: hidden, behavior: 'auto' });
    };
    // Το πληκτρολόγιο ανεβαίνει με animation ~250ms: έλεγχος και μετά το τέλος του.
    const onFocusIn = () => {
      clearTimeout(timer);
      timer = setTimeout(reveal, 320);
    };

    vv.addEventListener('resize', reveal);
    container.addEventListener('focusin', onFocusIn);
    return () => {
      clearTimeout(timer);
      vv.removeEventListener('resize', reveal);
      container.removeEventListener('focusin', onFocusIn);
    };
  }, [containerRef, targetRef]);
}
