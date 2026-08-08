#!/usr/bin/env node
/**
 * Παράγει ΟΛΑ τα brand assets από μία πηγή γεωμετρίας (ίδια με το
 * src/components/Logo.tsx). Τρέξε μετά από αλλαγή στο σήμα:
 *
 *   node scripts/gen-brand-assets.mjs
 *
 * Θέλει `rsvg-convert` (librsvg). Γράφει σε public/.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = resolve(ROOT, 'public');
mkdirSync(PUB, { recursive: true });

// ── Πηγή αλήθειας: ίδια paths με το Logo.tsx ──────────────────────────────
const STAIR = 'M60 404 H144 V348 H228 V280 H312 V198 H396 V100 H452';
const MASS = 'M37 404 H144 V348 H228 V280 H312 V198 H396 V100 H475 V427 H37 Z';
const SW = 46;

const BLUE = '#3B82F6';
const GOLD = '#E0B341';
const BG = '#0B1017'; // ίδιο family με το app background

const mark = (color, { summit = false } = {}) => `
  <path d="${MASS}" fill="${color}" opacity="0.3"/>
  <path d="${STAIR}" fill="none" stroke="${color}" stroke-width="${SW}"
        stroke-linecap="butt" stroke-linejoin="miter"/>
  ${summit ? `<path d="M396 100 H452" fill="none" stroke="${GOLD}" stroke-width="${SW}" stroke-linecap="butt"/>` : ''}`;

const svg = (body, w = 512, h = 512, vb = '0 0 512 512') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}">${body}</svg>\n`;

/** Το σήμα μέσα σε rounded-square, με padding ασφαλείας για maskable icons. */
const inSquare = (scale, radius, summit) => `
  <rect width="512" height="512" rx="${radius}" fill="${BG}"/>
  <g transform="translate(256,258) scale(${scale}) translate(-256,-256)">${mark(BLUE, { summit })}</g>`;

const files = {
  // Το «γυμνό» σήμα — για inline χρήση/έγγραφα
  'logo.svg': svg(mark(BLUE, { summit: true })),
  // Favicon: χωρίς container, λίγο πιο μεγάλο για τα 16px του tab
  'favicon.svg': svg(mark(BLUE, { summit: true })),
  // App icon (PWA/Apple): container + safe area
  'app-icon.svg': svg(inSquare(0.78, 116, true)),
  // Maskable: πιο μικρό σήμα, ώστε να αντέχει το circular crop του Android
  'app-icon-maskable.svg': svg(inSquare(0.62, 0, true)),
};

for (const [name, content] of Object.entries(files)) {
  writeFileSync(resolve(PUB, name), content);
}

// ── OG / social preview 1200×630 ──────────────────────────────────────────
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="${BG}"/>
  <g opacity="0.05" transform="translate(636,-28) scale(1.1)">${mark('#FFFFFF')}</g>
  <g transform="translate(96,84) scale(0.5)">${mark(BLUE, { summit: true })}</g>
  <text x="96" y="404" fill="#E6EDF5" font-family="Inter, system-ui, sans-serif"
        font-size="86" font-weight="600" letter-spacing="-3">Anabasis</text>
  <text x="96" y="458" fill="#8A97A8" font-family="Inter, system-ui, sans-serif"
        font-size="29">Weighted calisthenics &amp; skill progression · offline-first</text>
  <rect x="96" y="500" width="104" height="4" rx="2" fill="${GOLD}"/>
  <text x="96" y="556" fill="#5C6B7E" font-family="Inter, system-ui, sans-serif"
        font-size="25" letter-spacing="1">anabasis.axonos.dev</text>
</svg>\n`;
writeFileSync(resolve(PUB, 'og.svg'), og);

// ── Raster ────────────────────────────────────────────────────────────────
const raster = [
  ['app-icon.svg', 'pwa-192x192.png', 192, 192],
  ['app-icon.svg', 'pwa-512x512.png', 512, 512],
  ['app-icon.svg', 'apple-touch-icon.png', 180, 180],
  ['app-icon-maskable.svg', 'pwa-maskable-512.png', 512, 512],
  ['og.svg', 'og.png', 1200, 630],
];

for (const [src, out, w, h] of raster) {
  execFileSync('rsvg-convert', [
    '-w', String(w), '-h', String(h),
    '-o', resolve(PUB, out), resolve(PUB, src),
  ]);
}

console.log(`brand assets → public/ (${Object.keys(files).length + 1} svg, ${raster.length} png)`);
