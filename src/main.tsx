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

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
