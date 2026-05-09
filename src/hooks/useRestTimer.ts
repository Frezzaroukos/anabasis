import { useCallback, useEffect, useRef, useState } from 'react';

interface UseRestTimerOptions {
  defaultSeconds: number;
  onComplete?: () => void;
}

interface UseRestTimerResult {
  remaining: number;
  running: boolean;
  start: (seconds?: number) => void;
  stop: () => void;
}

/**
 * Manual rest timer.
 *  - start(s?) begins countdown from s (or default)
 *  - stop()    cancels and resets to 0
 *  - on natural reach-zero: calls onComplete then resets to 0
 */
export function useRestTimer({
  defaultSeconds,
  onComplete,
}: UseRestTimerOptions): UseRestTimerResult {
  const [running, setRunning] = useState(false);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const completedFiredRef = useRef(false);

  const stop = useCallback(() => {
    setRunning(false);
    setEndsAt(null);
    setRemaining(0);
    completedFiredRef.current = false;
  }, []);

  const start = useCallback(
    (seconds?: number) => {
      const s = Math.max(1, Math.floor(seconds ?? defaultSeconds));
      completedFiredRef.current = false;
      setEndsAt(Date.now() + s * 1000);
      setRemaining(s);
      setRunning(true);
    },
    [defaultSeconds],
  );

  useEffect(() => {
    if (!running || endsAt == null) return;
    const tick = () => {
      const r = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(r);
      if (r <= 0 && !completedFiredRef.current) {
        completedFiredRef.current = true;
        onComplete?.();
        setRunning(false);
        setEndsAt(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [running, endsAt, onComplete]);

  return { remaining, running, start, stop };
}
