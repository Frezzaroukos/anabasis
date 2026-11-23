import { useEffect, useState } from 'react';

/** Κάτω από αυτό είναι «θόρυβος» (μπάρα του browser που μαζεύεται), όχι πληκτρολόγιο. */
const MIN_KEYBOARD_PX = 80;

/**
 * Πόσα px του layout viewport καλύπτει το soft keyboard: ό,τι μένει κάτω από
 * το ορατό (visual) viewport. Με pinch-zoom το visual viewport μικραίνει χωρίς
 * πληκτρολόγιο — τότε 0.
 */
export function keyboardInset(
  viewport: { height: number; offsetTop: number; scale?: number },
  layoutHeight: number,
): number {
  if ((viewport.scale ?? 1) > 1.01) return 0;
  const covered = Math.round(layoutHeight - viewport.height - viewport.offsetTop);
  return covered >= MIN_KEYBOARD_PX ? covered : 0;
}

/**
 * Ύψος του soft keyboard σε px (0 όταν είναι κλειστό ή όταν `enabled` false).
 * Android Chrome (από v108) και iOS Safari ΔΕΝ μικραίνουν το layout viewport
 * όταν ανοίγει το πληκτρολόγιο — ό,τι είναι `fixed; bottom: 0` μένει από κάτω
 * του. Το visualViewport είναι το μόνο κοινό API που το βλέπει.
 */
export function useKeyboardInset(enabled = true): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = globalThis.visualViewport;
    if (!enabled || !vv) {
      setInset(0);
      return;
    }
    const update = () => setInset(keyboardInset(vv, window.innerHeight));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);
  return inset;
}
