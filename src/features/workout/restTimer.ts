import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Rest timer μεταξύ σετ. Ένα κοινό store (module-level) ώστε οποιοδήποτε
 * ExerciseCard να ξεκινά το ίδιο χρονόμετρο, και η μπάρα στο ActiveWorkoutView
 * να το δείχνει. Αποθηκεύεται το ΤΕΛΟΣ (timestamp), όχι «δευτερόλεπτα που
 * απομένουν» — έτσι μένει σωστό όταν η οθόνη κλειδώνει/το tab πάει background,
 * και επιβιώνει ενός refresh (localStorage).
 */

const STORAGE_KEY = 'anabasis.restEndsAt';
const MIN_REST_S = 5;
const MAX_REST_S = 60 * 60;

interface RestState {
  /** epoch ms που τελειώνει η ανάπαυση, ή null όταν δεν τρέχει. */
  endsAt: number | null;
  /** Η αρχική διάρκεια (για progress bar). */
  totalSeconds: number;
  /** true όταν μόλις έληξε (η μπάρα δείχνει «έτοιμος» μέχρι το επόμενο σετ/dismiss). */
  finished: boolean;
}

let state: RestState = { endsAt: null, totalSeconds: 0, finished: false };
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;
let onFinish: (() => void) | null = null;

function emit() {
  state = { ...state };
  for (const l of listeners) l();
}

function persist() {
  try {
    if (state.endsAt == null) globalThis.localStorage?.removeItem(STORAGE_KEY);
    else
      globalThis.localStorage?.setItem(
        STORAGE_KEY,
        JSON.stringify({ endsAt: state.endsAt, total: state.totalSeconds }),
      );
  } catch {
    /* private mode */
  }
}

function stopTicker() {
  if (ticker != null) {
    clearInterval(ticker);
    ticker = null;
  }
}

function tick() {
  if (state.endsAt == null) return stopTicker();
  if (Date.now() >= state.endsAt) {
    stopTicker();
    state = { endsAt: null, totalSeconds: state.totalSeconds, finished: true };
    persist();
    emit();
    onFinish?.();
  }
}

function ensureTicker() {
  if (ticker == null) ticker = setInterval(tick, 250);
}

export function formatRest(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function clampRestSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return MIN_REST_S;
  return Math.min(MAX_REST_S, Math.max(MIN_REST_S, Math.round(seconds)));
}

export function startRest(seconds: number, now = Date.now()): void {
  const total = clampRestSeconds(seconds);
  state = { endsAt: now + total * 1000, totalSeconds: total, finished: false };
  persist();
  ensureTicker();
  emit();
}

/** ±N δευτερόλεπτα στην τρέχουσα ανάπαυση (π.χ. −15/+15). */
export function adjustRest(deltaSeconds: number, now = Date.now()): void {
  if (state.endsAt == null) return;
  const remaining = Math.max(0, state.endsAt - now) / 1000;
  const next = clampRestSeconds(remaining + deltaSeconds);
  state = { endsAt: now + next * 1000, totalSeconds: Math.max(state.totalSeconds, next), finished: false };
  persist();
  emit();
}

export function stopRest(): void {
  stopTicker();
  state = { endsAt: null, totalSeconds: 0, finished: false };
  persist();
  emit();
}

/** Τι να γίνει όταν λήξει (δόνηση/ήχος) — ορίζεται από το UI ανάλογα με τα settings. */
export function setRestFinishHandler(fn: (() => void) | null): void {
  onFinish = fn;
}

/** Επαναφορά μετά από refresh: αν το τέλος είναι στο μέλλον, συνεχίζει. */
export function restoreRest(now = Date.now()): void {
  if (state.endsAt != null) return;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { endsAt?: unknown; total?: unknown };
    if (typeof parsed.endsAt !== 'number' || parsed.endsAt <= now) {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
      return;
    }
    state = {
      endsAt: parsed.endsAt,
      totalSeconds: typeof parsed.total === 'number' ? parsed.total : Math.round((parsed.endsAt - now) / 1000),
      finished: false,
    };
    ensureTicker();
    emit();
  } catch {
    /* corrupt value — ignore */
  }
}

export function remainingSeconds(now = Date.now()): number {
  return state.endsAt == null ? 0 : Math.max(0, Math.ceil((state.endsAt - now) / 1000));
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useRestTimer(): RestState & { remaining: number } {
  const snap = useSyncExternalStore(subscribe, () => state);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    restoreRest();
  }, []);
  // Ξανα-render ανά 250ms ΜΟΝΟ όσο τρέχει, ώστε να κατεβαίνει το νούμερο.
  useEffect(() => {
    if (snap.endsAt == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [snap.endsAt]);
  return { ...snap, remaining: snap.endsAt == null ? 0 : Math.max(0, Math.ceil((snap.endsAt - now) / 1000)) };
}

/** Μόνο για tests. */
export function __resetRestTimer(): void {
  stopTicker();
  listeners.clear();
  onFinish = null;
  state = { endsAt: null, totalSeconds: 0, finished: false };
}
