import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

/**
 * Τα json είναι ~220 kB μαζί. Μένουν εκτός entry: το πρώτο paint φορτώνει
 * μόνο τη γλώσσα που θα δει ο χρήστης (και τα αγγλικά ως fallback αν είναι
 * ελληνικά). Η άλλη γλώσσα έρχεται στο idle, ώστε η αλλαγή από τις Ρυθμίσεις
 * να μην περιμένει δίκτυο.
 */
const LOADERS = {
  en: () => import('./en.json'),
  el: () => import('./el.json'),
} as const;

export type AppLanguage = keyof typeof LOADERS;

export function initialLanguage(stored: string | null, navigatorLanguage: string): AppLanguage {
  if (stored === 'en' || stored === 'el') return stored;
  return navigatorLanguage.toLowerCase().startsWith('el') ? 'el' : 'en';
}

function detectLanguage(): AppLanguage {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem('sa.lang');
  } catch {
    stored = null;
  }
  return initialLanguage(stored, navigator.language || 'en');
}

async function loadLanguage(lng: AppLanguage): Promise<Record<string, unknown>> {
  const mod = await LOADERS[lng]();
  return mod.default;
}

async function ensureLanguage(lng: string): Promise<void> {
  if (lng !== 'en' && lng !== 'el') return;
  if (i18n.hasResourceBundle(lng, 'translation')) return;
  const bundle = await loadLanguage(lng);
  i18n.addResourceBundle(lng, 'translation', bundle, true, true);
}

let switching = false;

export async function initI18n(): Promise<void> {
  const lng = detectLanguage();
  const primary = await loadLanguage(lng);
  const resources: Record<string, { translation: Record<string, unknown> }> = {
    [lng]: { translation: primary },
  };
  if (lng !== 'en') {
    resources.en = { translation: await loadLanguage('en') };
  }

  await i18n.use(LanguageDetector).use(initReactI18next).init({
    lng,
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'el'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'sa.lang',
    },
  });

  document.documentElement.lang = i18n.resolvedLanguage ?? lng;
  i18n.on('languageChanged', (next) => {
    document.documentElement.lang = next;
    if (switching || i18n.hasResourceBundle(next, 'translation')) return;
    switching = true;
    void ensureLanguage(next)
      .then(() => i18n.changeLanguage(next))
      .finally(() => {
        switching = false;
      });
  });

  const other: AppLanguage = lng === 'en' ? 'el' : 'en';
  const prefetch = () => {
    void ensureLanguage(other);
  };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(prefetch);
  else window.setTimeout(prefetch, 200);
}

export { i18n };
export default i18n;
