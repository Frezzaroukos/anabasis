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
  // Mono = το signature του Carbon: near-white σε dark, γραφίτης-μαύρο σε light.
  // Πρώτο και default — τα υπόλοιπα βάφουν ΜΟΝΟ το accent, η γραφίτης βάση μένει.
  { key: 'mono', label: 'Carbon', swatch: 'linear-gradient(135deg,#E8E8EC 50%,#101013 50%)',
    dark: { primary: '240 9% 92%', fg: '240 8% 9%' }, light: { primary: '240 8% 12%', fg: '0 0% 100%' } },
  { key: 'blue', label: 'Ocean', swatch: 'hsl(212 90% 56%)',
    dark: { primary: '212 90% 60%', fg: '212 40% 8%' }, light: { primary: '214 85% 46%', fg: '0 0% 100%' } },
  { key: 'emerald', label: 'Emerald', swatch: 'hsl(152 62% 45%)',
    dark: { primary: '152 60% 50%', fg: '152 40% 7%' }, light: { primary: '152 65% 36%', fg: '0 0% 100%' } },
  { key: 'violet', label: 'Aurora', swatch: 'hsl(264 100% 68%)',
    dark: { primary: '264 100% 68%', fg: '258 40% 8%' }, light: { primary: '264 85% 58%', fg: '0 0% 100%' } },
  { key: 'crimson', label: 'Crimson', swatch: 'hsl(348 83% 58%)',
    dark: { primary: '348 85% 62%', fg: '348 40% 8%' }, light: { primary: '348 75% 50%', fg: '0 0% 100%' } },
  { key: 'cyan', label: 'Cyan', swatch: 'hsl(190 85% 50%)',
    dark: { primary: '190 85% 55%', fg: '190 50% 7%' }, light: { primary: '190 80% 40%', fg: '0 0% 100%' } },
  { key: 'orange', label: 'Ember', swatch: 'hsl(22 90% 56%)',
    dark: { primary: '24 90% 58%', fg: '24 45% 8%' }, light: { primary: '22 85% 48%', fg: '0 0% 100%' } },
  { key: 'gold', label: 'Gold', swatch: 'hsl(40 84% 56%)',
    dark: { primary: '40 84% 56%', fg: '32 40% 8%' }, light: { primary: '32 78% 42%', fg: '40 40% 98%' } },
];

/*
 * Carbon/mono = το default του brand v3 — ο χρήστης διαλέγει άλλο χρώμα ή custom.
 */
const DEFAULT_ACCENT = 'mono';
const CUSTOM_ACCENT_KEY = 'anabasis.accent.custom';

/**
 * Custom accent: ο χρήστης δίνει ένα hex — το μετατρέπουμε σε HSL (τα tokens
 * είναι σε HSL) και υπολογίζουμε το foreground (μαύρο/λευκό) από τη φωτεινότητα
 * ώστε το κείμενο πάνω στο κουμπί να έχει contrast. Αποθηκεύεται ξεχωριστά.
 */
export function hexToHslParts(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0,
    s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function getStoredCustomAccent(): string | null {
  try {
    return globalThis.localStorage?.getItem(CUSTOM_ACCENT_KEY) ?? null;
  } catch {
    return null;
  }
}

export function setCustomAccent(hex: string): boolean {
  const hsl = hexToHslParts(hex);
  if (!hsl) return false;
  try {
    globalThis.localStorage?.setItem(CUSTOM_ACCENT_KEY, hex);
    globalThis.localStorage?.setItem(ACCENT_KEY, 'custom');
  } catch {
    /* noop */
  }
  applyAccent('custom');
  return true;
}

export function getStoredAccent(): string {
  try {
    const v = globalThis.localStorage?.getItem(ACCENT_KEY);
    if (v === 'custom' && getStoredCustomAccent()) return 'custom';
    if (v && ACCENTS.some((a) => a.key === v)) return v;
  } catch {
    /* private mode */
  }
  return DEFAULT_ACCENT;
}

export function applyAccent(accentKey: string): void {
  const root = document.documentElement;

  if (accentKey === 'custom') {
    const hex = getStoredCustomAccent();
    const hsl = hex ? hexToHslParts(hex) : null;
    if (hsl) {
      // Foreground: μαύρο πάνω σε ανοιχτό accent, λευκό πάνω σε σκούρο.
      const fg = hsl.l > 62 ? '240 8% 9%' : '0 0% 100%';
      const primary = `${hsl.h} ${hsl.s}% ${hsl.l}%`;
      root.style.setProperty('--primary', primary);
      root.style.setProperty('--primary-foreground', fg);
      root.style.setProperty('--ring', primary);
      return;
    }
  }

  const accent = ACCENTS.find((a) => a.key === accentKey) ?? ACCENTS[0]!;
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
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#101013' : '#F7F7F5');
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
