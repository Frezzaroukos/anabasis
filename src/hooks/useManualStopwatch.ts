import { useCallback, useEffect, useState } from 'react';

/**
 * Χειροκίνητο χρονόμετρο προπόνησης — ο χρήστης το ΞΕΚΙΝΑ και το ΣΤΑΜΑΤΑ με τη
 * θέλησή του (όχι auto-count από τη στιγμή που άνοιξε η συνεδρία). Ο
 * συσσωρευμένος χρόνος γίνεται η ΤΙΜΙΑ διάρκεια της προπόνησης (μόνο ο χρόνος που
 * όντως μετρούσες, όχι wall-clock με το κινητό στην τσέπη).
 *
 * State persist σε localStorage ανά workout id → επιβιώνει reload/κλείσιμο tab.
 * Shape: { acc: ms συσσωρευμένα όσο ήταν σε παύση, since: ms epoch αν τρέχει τώρα }.
 */
interface SwState {
  acc: number;
  since: number | null;
}

const KEY = (id: string) => `anabasis.stopwatch.${id}`;

function read(id: string): SwState {
  try {
    const raw = globalThis.localStorage?.getItem(KEY(id));
    if (raw) {
      const p = JSON.parse(raw) as Partial<SwState>;
      return { acc: Number(p.acc) || 0, since: typeof p.since === 'number' ? p.since : null };
    }
  } catch {
    /* private mode / corrupt */
  }
  return { acc: 0, since: null };
}

function write(id: string, s: SwState): void {
  try {
    globalThis.localStorage?.setItem(KEY(id), JSON.stringify(s));
  } catch {
    /* noop */
  }
}

function elapsedMs(s: SwState): number {
  return s.acc + (s.since != null ? Math.max(0, Date.now() - s.since) : 0);
}

/** Για το endWorkout: πόσα δευτερόλεπτα μέτρησε ο χρήστης (0 αν δεν το άγγιξε). */
export function readStopwatchSeconds(id: string): number {
  return Math.round(elapsedMs(read(id)) / 1000);
}

export function clearStopwatch(id: string): void {
  try {
    globalThis.localStorage?.removeItem(KEY(id));
  } catch {
    /* noop */
  }
}

export interface ManualStopwatch {
  seconds: number;
  running: boolean;
  /** ξεκίνα/σταμάτα (παύση) */
  toggle: () => void;
  reset: () => void;
}

export function useManualStopwatch(workoutId: string): ManualStopwatch {
  const [state, setState] = useState<SwState>(() => read(workoutId));

  // Ξαναδιάβασε όταν αλλάζει η προπόνηση (π.χ. νέα συνεδρία στο ίδιο view).
  useEffect(() => {
    setState(read(workoutId));
  }, [workoutId]);

  // Tick κάθε δευτερόλεπτο ΜΟΝΟ όσο τρέχει — re-render για ζωντανό μετρητή.
  const [, force] = useState(0);
  useEffect(() => {
    if (state.since == null) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [state.since]);

  const toggle = useCallback(() => {
    setState((s) => {
      const next: SwState =
        s.since == null
          ? { acc: s.acc, since: Date.now() } // start/resume
          : { acc: s.acc + Math.max(0, Date.now() - s.since), since: null }; // pause
      write(workoutId, next);
      return next;
    });
  }, [workoutId]);

  const reset = useCallback(() => {
    const next: SwState = { acc: 0, since: null };
    write(workoutId, next);
    setState(next);
  }, [workoutId]);

  return {
    seconds: Math.round(elapsedMs(state) / 1000),
    running: state.since != null,
    toggle,
    reset,
  };
}
