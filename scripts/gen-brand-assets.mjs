#!/usr/bin/env node
/**
 * Παράγει ΟΛΑ τα brand assets από το `branding/logo-v2/mark.svg`.
 * Τρέξε μετά από αλλαγή στο σήμα:
 *
 *   node scripts/gen-brand-assets.mjs
 *
 * Θέλει `rsvg-convert` (librsvg). Γράφει σε public/.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = resolve(ROOT, 'public');
mkdirSync(PUB, { recursive: true });

// ── Πηγή αλήθειας: το ίδιο mark με branding/logo-v2/mark.svg ───────────────
// «Ascent A»: bold A + violet route. Τα δύο paths διαβάζονται από το SVG.
const markSource = readFileSync(resolve(ROOT, 'branding/logo-v2/mark.svg'), 'utf8');
const MARK_PATHS = [...markSource.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
if (MARK_PATHS.length !== 2) {
  throw new Error(`Expected 2 paths in branding/logo-v2/mark.svg, found ${MARK_PATHS.length}`);
}

// ── Daylight palette (docs/DESIGN-SPEC-V2.md + globals.css) ────────────────
const DARK = '#1C1C21'; // foreground
const VIOLET = '#8239EF'; // primary
const VIOLET_LIGHT = '#B88CFF'; // accent glow
const WHITE = '#F3F1F8';
const GOLD = '#F56E14'; // achievement
const BG = '#FCFCFD'; // app icon background
const MUTED = '#5E5A66';

/** Το σήμα σε viewBox 64, με τα δύο paths του πηγαίου SVG. */
const mark = (darkFill, { purpleFill = VIOLET, gradientId } = {}) => {
  const dark = gradientId ? `url(#${gradientId})` : darkFill;
  return `<g transform="translate(0,64) scale(0.00962406,-0.00962406)">
    <path fill="${dark}" d="${MARK_PATHS[0]}"/>
    <path fill="${purpleFill}" d="${MARK_PATHS[1]}"/>
  </g>`;
};

const svg = (body, w = 64, h = 64, vb = '0 0 64 64') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}">${body}</svg>\n`;

const inSquare = (scale, radius, { bg = BG } = {}) => `
  <rect width="64" height="64" rx="${radius}" fill="${bg}"/>
  <g transform="translate(32,32) scale(${scale}) translate(-32,-32)">${mark(DARK)}</g>`;

// Στα 16px η λεπτομέρεια του πλήρους σήματος χάνεται· το favicon κρατά
// το ίδιο A + violet route αλλά με πιο χοντρές φόρμες.
const faviconMark = `
  <path fill="${DARK}" d="M5 59 L29 5 H35 L59 59 H47 L32 27 L17 59 Z"/>
  <path fill="${VIOLET}" d="M10 59 C 17 47 24 37 31 27 C 34 22 37 17 39 12 L 43 15 C 39 24 35 32 30 41 C 26 48 22 54 19 59 Z"/>`;

const files = {
  // Το «γυμνό» σήμα, για inline χρήση/έγγραφα
  'logo.svg': svg(mark(DARK)),
  'logo-white.svg': svg(mark(WHITE, { purpleFill: VIOLET_LIGHT })),
  // Favicon: simplified A για καθαρή ανάγνωση στα 16px του tab
  'favicon.svg': svg(`<rect width="64" height="64" rx="14.5" fill="${BG}"/>${faviconMark}`),
  // App icon (PWA/Apple): container + πλήρες χρώμα σε φωτεινή βάση
  'app-icon.svg': svg(inSquare(0.74, 14.5)),
  // Maskable: μικρότερο σήμα ώστε να μένει μέσα στο 80% safe-zone
  'app-icon-maskable.svg': svg(inSquare(0.58, 0)),
};

for (const [name, content] of Object.entries(files)) {
  writeFileSync(resolve(PUB, name), content);
}

// ── OG / social preview 1200×630 ──────────────────────────────────────────
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="${BG}"/>
  <circle cx="985" cy="118" r="330" fill="${VIOLET}" opacity="0.055"/>
  <g transform="translate(120,135) scale(4.6)">${mark(DARK)}</g>
  <text x="480" y="278" fill="${DARK}" font-family="'Fira Sans Condensed', Inter, system-ui, sans-serif"
        font-size="82" font-weight="600" letter-spacing="7">ANABASIS</text>
  <text x="484" y="336" fill="${VIOLET}" font-family="'Fira Sans Condensed', Inter, system-ui, sans-serif"
        font-size="25" font-weight="600" letter-spacing="6">RISE. PROGRESS. BECOME.</text>
  <rect x="484" y="374" width="88" height="4" rx="2" fill="${GOLD}"/>
  <text x="484" y="430" fill="${MUTED}" font-family="Manrope, Inter, system-ui, sans-serif"
        font-size="27">Weighted calisthenics &amp; skill progression · offline-first</text>
  <text x="484" y="476" fill="#8A8592" font-family="Manrope, Inter, system-ui, sans-serif"
        font-size="24" letter-spacing="1">anabasis.axonos.dev</text>
</svg>\n`;
writeFileSync(resolve(PUB, 'og.svg'), og);

// ── Raster ────────────────────────────────────────────────────────────────
const raster = [
  ['app-icon.svg', 'pwa-192x192.png', 192, 192],
  ['app-icon.svg', 'pwa-512x512.png', 512, 512],
  ['app-icon.svg', 'apple-touch-icon.png', 180, 180],
  ['app-icon-maskable.svg', 'pwa-maskable-512.png', 512, 512],
  ['favicon.svg', 'favicon-16.png', 16, 16],
  ['favicon.svg', 'favicon-32.png', 32, 32],
  ['favicon.svg', 'favicon-48.png', 48, 48],
  ['og.svg', 'og.png', 1200, 630],
];

for (const [src, out, w, h] of raster) {
  execFileSync('rsvg-convert', [
    '-w', String(w), '-h', String(h),
    '-o', resolve(PUB, out), resolve(PUB, src),
  ]);
}

console.log(`brand assets → public/ (${Object.keys(files).length + 1} svg, ${raster.length} png)`);
