/**
 * Θέμα εμφάνισης. Το `theme` υπάρχει ήδη στο AppSettings (Dexie), αλλά αυτό
 * είναι async — για να μην «αναβοσβήνει» το app στο boot, κρατάμε ΚΑΙ ένα
 * σύγχρονο αντίγραφο στο localStorage και το εφαρμόζουμε πριν το πρώτο render.
 */
export type Theme = 'dark' | 'light' | 'auto';

const STORAGE_KEY = 'anabasis.theme';
const ACCENT_KEY = 'anabasis.accent';

/**
 * Το accent (κύριο χρώμα) είναι επιλογή του χρήστη — δεν κλειδώνεται σε ένα.
 * Κάθε preset δίνει HSL για dark ΚΑΙ light (διαφορετική φωτεινότητα ώστε να
 * έχει contrast σε λευκό φόντο). Το χρυσό των ρεκόρ (`--gold`) ΔΕΝ αλλάζει —
 * επίτευξη = χρυσό, ανεξάρτητα από το accent.
 */
export interface AccentPreset {
  key: string;
  label: string;
  /** χρώμα «δείγματος» για το κουμπί επιλογής */
  swatch: string;
  dark: { primary: string; fg: string };
  light: { primary: string; fg: string };
}

export const ACCENTS: AccentPreset[] = [
  { key: 'blue', label: 'Ocean', swatch: 'hsl(212 90% 56%)',
    dark: { primary: '212 90% 60%', fg: '212 40% 8%' }, light: { primary: '214 85% 46%', fg: '0 0% 100%' } },
  { key: 'emerald', label: 'Emerald', swatch: 'hsl(152 62% 45%)',
    dark: { primary: '152 60% 50%', fg: '152 40% 7%' }, light: { primary: '152 65% 36%', fg: '0 0% 100%' } },
  { key: 'violet', label: 'Violet', swatch: 'hsl(265 85% 66%)',
    dark: { primary: '265 85% 70%', fg: '265 40% 8%' }, light: { primary: '265 70% 55%', fg: '0 0% 100%' } },
  { key: 'crimson', label: 'Crimson', swatch: 'hsl(348 83% 58%)',
    dark: { primary: '348 85% 62%', fg: '348 40% 8%' }, light: { primary: '348 75% 50%', fg: '0 0% 100%' } },
  { key: 'cyan', label: 'Cyan', swatch: 'hsl(190 85% 50%)',
    dark: { primary: '190 85% 55%', fg: '190 50% 7%' }, light: { primary: '190 80% 40%', fg: '0 0% 100%' } },
  { key: 'orange', label: 'Ember', swatch: 'hsl(22 90% 56%)',
    dark: { primary: '24 90% 58%', fg: '24 45% 8%' }, light: { primary: '22 85% 48%', fg: '0 0% 100%' } },
  { key: 'gold', label: 'Gold', swatch: 'hsl(40 84% 56%)',
    dark: { primary: '40 84% 56%', fg: '32 40% 8%' }, light: { primary: '32 78% 42%', fg: '40 40% 98%' } },
];

const DEFAULT_ACCENT = 'blue';

export function getStoredAccent(): string {
  try {
    const v = globalThis.localStorage?.getItem(ACCENT_KEY);
    if (v && ACCENTS.some((a) => a.key === v)) return v;
  } catch {
    /* private mode */
  }
  return DEFAULT_ACCENT;
}

export function applyAccent(accentKey: string): void {
  const accent = ACCENTS.find((a) => a.key === accentKey) ?? ACCENTS[0]!;
  const root = document.documentElement;
  const isDark = root.classList.contains('dark');
  const c = isDark ? accent.dark : accent.light;
  root.style.setProperty('--primary', c.primary);
  root.style.setProperty('--primary-foreground', c.fg);
  root.style.setProperty('--ring', c.primary);
}

export function setAccent(accentKey: string): void {
  try {
    globalThis.localStorage?.setItem(ACCENT_KEY, accentKey);
  } catch {
    /* noop */
  }
  applyAccent(accentKey);
}

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
  // Το accent primary έχει διαφορετική φωτεινότητα σε dark/light — ξανα-εφάρμοσέ το.
  applyAccent(getStoredAccent());
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
