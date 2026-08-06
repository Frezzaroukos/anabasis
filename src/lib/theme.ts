/**
 * Θέμα εμφάνισης. Το `theme` υπάρχει ήδη στο AppSettings (Dexie), αλλά αυτό
 * είναι async — για να μην «αναβοσβήνει» το app στο boot, κρατάμε ΚΑΙ ένα
 * σύγχρονο αντίγραφο στο localStorage και το εφαρμόζουμε πριν το πρώτο render.
 */
export type Theme = 'dark' | 'light' | 'auto';

const STORAGE_KEY = 'anabasis.theme';

export function getStoredTheme(): Theme {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (v === 'dark' || v === 'light' || v === 'auto') return v;
  } catch {
    /* private mode */
  }
  return 'dark';
}

/** «auto» = ακολούθησε το σύστημα (matchMedia). */
export function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'auto') {
    const prefersDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
    return prefersDark ? 'dark' : 'light';
  }
  return theme;
}

export function applyTheme(theme: Theme): void {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  // theme-color meta ώστε η μπάρα του browser/PWA να ταιριάζει
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0d0c0a' : '#faf9f7');
}

export function setTheme(theme: Theme): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, theme);
  } catch {
    /* noop */
  }
  applyTheme(theme);
}

/**
 * Παρακολούθηση αλλαγών συστήματος όταν το θέμα είναι «auto». Επιστρέφει
 * cleanup. Χωρίς αυτό, το «auto» δεν θα άλλαζε live όταν ο χρήστης αλλάζει
 * dark/light στο λειτουργικό.
 */
export function watchSystemTheme(getTheme: () => Theme): () => void {
  const mq = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  if (!mq) return () => {};
  const handler = () => {
    if (getTheme() === 'auto') applyTheme('auto');
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
