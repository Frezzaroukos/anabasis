import { useEffect, useState } from 'react';

export function usePresence(open: boolean, durationMs = 180) {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const timer = window.setTimeout(() => setMounted(false), durationMs);
    return () => window.clearTimeout(timer);
  }, [open, mounted, durationMs]);

  return { mounted, closing: mounted && !open };
}
