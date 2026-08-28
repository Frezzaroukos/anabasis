import { useEffect, useRef, useState } from 'react';

/**
 * Number ticker: ο αριθμός «ανεβαίνει» ως την τελική τιμή αντί να εμφανίζεται
 * απότομα — απαντά στο «ο αριθμός μόλις άλλαξε» (βλ. DESIGN-SPEC-V2, motion).
 * Ease-out ώστε το τέλος να «κάθεται»· 200-500ms, ποτέ παραπάνω.
 * Με prefers-reduced-motion η τιμή μπαίνει κατευθείαν — όχι προαιρετικό.
 */
export function useCountUp(target: number, durationMs = 450, decimals = 0): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced || !Number.isFinite(target)) {
      fromRef.current = target;
      setValue(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const t0 = performance.now();
    const factor = 10 ** decimals;

    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - (1 - p) ** 3;
      setValue(Math.round((from + (target - from) * eased) * factor) / factor);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs, decimals]);

  return value;
}
