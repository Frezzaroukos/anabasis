import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

const basePath = process.env.BASE_PATH ?? '/';

export default defineConfig({
  /*
   * Σερβίρεται από δύο σημεία:
   *  · anabasis.axonos.dev (root) — Cloudflare tunnel από το PC
   *  · frezzaroukos.github.io/anabasis/ — GitHub Pages, πάντα ζωντανό
   * Το BASE_PATH το θέτει το CI· τοπικά μένει '/'.
   */
  base: basePath,
  // Μέσα στο Tauri (desktop app) δεν έχει νόημα service worker: τα assets
  // είναι ήδη τοπικά, κι ένας stale SW θα σέρβιρε παλιά έκδοση μετά από update.
  // Το tauri-cli θέτει TAURI_ENV_PLATFORM στα before*Command — εκεί κόβεται το PWA.
  plugins: [
    react(),
    !process.env.TAURI_ENV_PLATFORM &&
    VitePWA({
      registerType: 'autoUpdate',
      // Ο κώδικας εγγραφής του service worker δεν χρειάζεται να μπλοκάρει το
      // πρώτο paint — defer ώστε το FCP/LCP να μη χρεώνονται ~300ms.
      injectRegister: 'script-defer',
      includeAssets: [
        'favicon.svg',
        'favicon-16.png',
        'favicon-32.png',
        'apple-touch-icon.png',
        'og.png',
        'robots.txt',
      ],
      manifest: {
        name: 'Anabasis — weighted calisthenics & skill progression',
        short_name: 'Anabasis',
        description:
          'Κάθε skill είναι μια σκάλα. Offline-first tracker για weighted calisthenics και skill progressions.',
        theme_color: '#FCFCFD',
        background_color: '#FCFCFD',
        display: 'standalone',
        orientation: 'portrait',
        start_url: basePath,
        categories: ['health', 'fitness', 'sports'],
        icons: [
          { src: `${basePath}pwa-192x192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${basePath}pwa-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Ξεχωριστό maskable: το Android κόβει κύκλο — το σήμα είναι μικρότερο εκεί.
          { src: `${basePath}pwa-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Νέα προπόνηση', short_name: 'Προπόνηση', url: `${basePath}workout` },
          { name: 'Ημερολόγιο', short_name: 'Ημερολόγιο', url: `${basePath}calendar` },
          { name: 'Πρόοδος', short_name: 'Πρόοδος', url: `${basePath}progress` },
        ],
        // Screenshots → το Chrome/Android δείχνει το πλούσιο install prompt
        // (προεπισκόπηση app) αντί για το μίνιμαλ. Χρειάζεται ≥1 narrow + ≥1 wide.
        screenshots: [
          { src: `${basePath}screenshots/mobile-dashboard.png`, sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Πίνακας — η πρόοδός σου με μια ματιά' },
          { src: `${basePath}screenshots/mobile-calendar.png`, sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Ημερολόγιο — το σπίτι του logging' },
          { src: `${basePath}screenshots/mobile-skills.png`, sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Skills — κάθε skill μια σκάλα' },
          { src: `${basePath}screenshots/desktop-dashboard.png`, sizes: '1920x1200', type: 'image/png', form_factor: 'wide', label: 'Anabasis στον υπολογιστή' },
          { src: `${basePath}screenshots/desktop-calendar.png`, sizes: '1920x1200', type: 'image/png', form_factor: 'wide', label: 'Ημερολόγιο σε πλήρη οθόνη' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Τα press assets είναι για ανθρώπους (README/δελτίο τύπου) και τα
        // screenshots για το install-prompt του browser — κανένα δεν το χρειάζεται
        // η εφαρμογή offline, οπότε έξω από το precache.
        globIgnores: ['press/**', 'screenshots/**'],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Production CSP only permits same-origin fonts; embedded data: fonts
    // otherwise fail silently (including Greek glyph subsets).
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Το recharts + d3 είναι το βαρύτερο dependency· δικό του chunk ώστε
        // να cache-άρεται ξεχωριστά και να μη φουσκώνει το κύριο bundle.
        manualChunks(id: string) {
          // Μικρά utils που χρησιμοποιεί το `cn()` (utils.ts) ΠΑΝΤΟΥ, eager:
          // δέσ' τα στο σταθερό 'react' chunk. Αλλιώς, επειδή το recharts
          // εξαρτάται κι αυτό από το clsx, το clsx απορροφιόταν μέσα στο
          // recharts chunk — και το `cn()` έσερνε ΟΛΟ το recharts (~107KB gz)
          // σε κάθε σελίδα, ακόμη κι εκεί που δεν υπάρχει γράφημα.
          if (
            id.includes('node_modules/clsx') ||
            id.includes('node_modules/class-variance-authority') ||
            id.includes('node_modules/tailwind-merge')
          ) {
            return 'react';
          }
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) {
            return 'recharts';
          }
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/react/')
          ) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    // Ώστε το dev server να είναι κι αυτό same-origin σαν το production
    // tunnel — χωρίς αυτό, τα fetch() του src/lib/api/client.ts θα έβρισκαν
    // 404 σε `npm run dev` (η ρύθμιση Tauri μιλάει κατευθείαν στο :8121, δεν
    // την αφορά αυτό).
    proxy: {
      '/api': 'http://localhost:8121',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
