import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@/i18n';
import '@/styles/globals.css';
import { applyTheme, getStoredTheme } from '@/lib/theme';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

// Εφάρμοσε το αποθηκευμένο θέμα ΠΡΙΝ το πρώτο render, ώστε να μην αναβοσβήσει.
applyTheme(getStoredTheme());

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
