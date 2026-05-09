import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@/i18n';
import '@/styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

// Apply dark theme by default — user can switch via settings later.
document.documentElement.classList.add('dark');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
