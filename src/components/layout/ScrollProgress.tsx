import { useEffect, useRef } from 'react';

/**
 * Λεπτή γραμμή προόδου ανάγνωσης, καρφιτσωμένη στο πάνω άκρο της οθόνης.
 * Ενημερώνεται με rAF (χωρίς re-render ανά frame) και εξαφανίζεται όταν δεν
 * υπάρχει τίποτα να σκρολάρεις — ποτέ δεν πιάνει κλικ ή χώρο.
 */
export function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    let frame = 0;

    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.transform = `scaleX(${progress})`;
      bar.style.opacity = progress > 0.005 ? '1' : '0';
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div
      ref={barRef}
      data-scroll-progress
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[45] h-[2px] origin-left bg-primary/70 opacity-0 transition-opacity duration-200 motion-reduce:transition-none"
    />
  );
}
