import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
/*
 * Fonts: bundled τοπικά (fontsource) — offline-first app δεν φορτώνει από
 * CDN. Fira Sans Condensed/Manrope/JetBrains Mono = τα verified με πλήρη
 * ελληνικά subsets (τα «αθλητικά» Oswald/Bebas/Space Grotesk ΔΕΝ έχουν).
 */
import '@fontsource/fira-sans-condensed/500.css';
import '@fontsource/fira-sans-condensed/600.css';
import '@fontsource/fira-sans-condensed/700.css';
import '@fontsource-variable/manrope';
import '@fontsource-variable/jetbrains-mono';
import '@/styles/globals.css';
import { initI18n } from '@/i18n';
import { applyTheme, getStoredTheme } from '@/lib/theme';
import { reloadOnServiceWorkerUpdate, showVersionRefreshToast } from '@/lib/pwa';
import { initSession } from '@/lib/db/session';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

// Εφάρμοσε το αποθηκευμένο θέμα ΠΡΙΝ το πρώτο render, ώστε να μην αναβοσβήσει.
applyTheme(getStoredTheme());
initSession();


/*
 * Χωρίς backend, το IndexedDB είναι το ΜΟΝΑΔΙΚΟ αντίγραφο των δεδομένων —
 * και χωρίς persist() ο browser δικαιούται να το πετάξει υπό πίεση χώρου.
 * Best-effort: όπου δεν υποστηρίζεται/απορρίπτεται, απλώς δεν αλλάζει κάτι.
 */
navigator.storage?.persist?.().catch(() => {});

/*
 * PWA auto-refresh: το workbox skipWaiting/clientsClaim (vite.config) αναλαμβάνει
 * αμέσως. Χωρίς reload η ανοιχτή σελίδα κρατάει τα παλιά JS στη μνήμη.
 * Ένα reload είναι ασφαλές όταν δεν υπάρχει ανοιχτή προπόνηση — τα σετ είναι
 * ήδη στο IndexedDB. Με ανοιχτή προπόνηση δεν κόβουμε τη φόρμα· μένει ένα
 * κουμπί ανανέωσης.
 */
if ('serviceWorker' in navigator) {
  const reload = () => globalThis.location.reload();
  reloadOnServiceWorkerUpdate(navigator.serviceWorker, reload, {
    shouldReload: async () => {
      const { getActiveWorkout } = await import('@/lib/db/queries');
      return (await getActiveWorkout()) == null;
    },
    onDefer: () => showVersionRefreshToast(reload),
  });
}

// Η γλώσσα είναι ξεχωριστό chunk. Περιμένουμε τη δική του πριν το πρώτο
// render, αλλιώς η Αρχική θα έδειχνε κλειδιά i18n.
void initI18n()
  .catch((err: unknown) => {
    console.error('[i18n]', err);
  })
  .then(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
