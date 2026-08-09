import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  /*
   * Σερβίρεται από δύο σημεία:
   *  · anabasis.axonos.dev (root) — Cloudflare tunnel από το PC
   *  · frezzaroukos.github.io/anabasis/ — GitHub Pages, πάντα ζωντανό
   * Το BASE_PATH το θέτει το CI· τοπικά μένει '/'.
   */
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'og.png', 'robots.txt'],
      manifest: {
        name: 'Anabasis — weighted calisthenics & skill progression',
        short_name: 'Anabasis',
        description:
          'Κάθε skill είναι μια σκάλα. Offline-first tracker για weighted calisthenics και skill progressions.',
        theme_color: '#0B1017',
        background_color: '#0B1017',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        categories: ['health', 'fitness', 'sports'],
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Ξεχωριστό maskable: το Android κόβει κύκλο — το σήμα είναι μικρότερο εκεί.
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Νέα προπόνηση', short_name: 'Προπόνηση', url: '/workout' },
          { name: 'Ημερολόγιο', short_name: 'Ημερολόγιο', url: '/calendar' },
          { name: 'Πρόοδος', short_name: 'Πρόοδος', url: '/progress' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Τα press assets είναι για ανθρώπους (README/δελτίο τύπου), όχι για
        // την εφαρμογή — 2.7MB δεν έχουν λόγο να μπουν στο offline cache.
        globIgnores: ['press/**'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Το recharts + d3 είναι το βαρύτερο dependency· δικό του chunk ώστε
        // να cache-άρεται ξεχωριστά και να μη φουσκώνει το κύριο bundle.
        manualChunks(id: string) {
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
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
