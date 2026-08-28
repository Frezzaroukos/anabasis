import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import el from './el.json';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      el: { translation: el },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'el'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'sa.lang',
    },
  });

// Το <html lang> πρέπει να ακολουθεί τη γλώσσα του UI — screen readers και
// hyphenation διαβάζουν από εκεί, όχι από το i18next.
document.documentElement.lang = i18n.resolvedLanguage ?? 'en';
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export { i18n };
export default i18n;
