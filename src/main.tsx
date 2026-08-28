import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@/i18n';
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
import { applyTheme, getStoredTheme } from '@/lib/theme';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

// Εφάρμοσε το αποθηκευμένο θέμα ΠΡΙΝ το πρώτο render, ώστε να μην αναβοσβήσει.
applyTheme(getStoredTheme());

/*
 * Χωρίς backend, το IndexedDB είναι το ΜΟΝΑΔΙΚΟ αντίγραφο των δεδομένων —
 * και χωρίς persist() ο browser δικαιούται να το πετάξει υπό πίεση χώρου.
 * Best-effort: όπου δεν υποστηρίζεται/απορρίπτεται, απλώς δεν αλλάζει κάτι.
 */
navigator.storage?.persist?.().catch(() => {});

/*
 * PWA auto-refresh: όταν ανέβει νέα έκδοση (deploy), ο service worker του
 * vite-plugin-pwa (autoUpdate) κάνει skipWaiting και «αναλαμβάνει». Χωρίς
 * reload, ο χρήστης έβλεπε ΠΑΛΙΑ έκδοση μέχρι να ξανανοίξει — τον ενοχλούσε.
 * Κάνουμε ΕΝΑ reload μόλις ο νέος SW αναλάβει (τα δεδομένα είναι στο
 * IndexedDB, δεν χάνεται τίποτα).
 */
if ('serviceWorker' in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    globalThis.location.reload();
  });
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
