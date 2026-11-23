/**
 * Μικρά helpers για συσκευές αφής — χωρίς state, ασφαλή σε SSR/jsdom.
 */

/** Δάχτυλο αντί για ποντίκι (τηλέφωνο/tablet). Στο jsdom/desktop → false. */
export function isCoarsePointer(): boolean {
  try {
    return globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  } catch {
    return false;
  }
}

/**
 * Σύντομο «τικ» δόνησης όταν κάτι καταγράφηκε — στο γυμναστήριο δεν κοιτάς
 * πάντα την οθόνη. Μόνο όπου υπάρχει Vibration API (Android)· σε iOS/desktop
 * είναι no-op. Ποτέ δεν πετά σφάλμα: η καταγραφή δεν εξαρτάται από τη δόνηση.
 */
export function hapticTick(pattern: number | number[] = 12): void {
  try {
    globalThis.navigator?.vibrate?.(pattern);
  } catch {
    /* unsupported / blocked */
  }
}

/**
 * Πόσα px του `bottom` (σε συντεταγμένες layout viewport, όπως τα δίνει το
 * getBoundingClientRect) πέφτουν κάτω από το ορατό κομμάτι της οθόνης — δηλαδή
 * πίσω από το soft keyboard. 0 = ορατό. `margin` αφήνει λίγο αέρα πάνω από το
 * πληκτρολόγιο ώστε το κουμπί να μην «ακουμπά» την άκρη.
 */
export function hiddenBelowViewport(
  bottom: number,
  viewport: { height: number; offsetTop: number },
  margin = 8,
): number {
  const visibleBottom = viewport.offsetTop + viewport.height;
  return Math.max(0, Math.ceil(bottom + margin - visibleBottom));
}
