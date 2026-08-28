#!/usr/bin/env node
/**
 * Παράγει ΟΛΑ τα brand assets από μία πηγή γεωμετρίας (ίδια με το
 * src/components/Logo.tsx / branding/logo-v2/mark.svg). Τρέξε μετά από
 * αλλαγή στο σήμα:
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

// ── Πηγή αλήθειας: ίδια γεωμετρία με branding/logo-v2/mark.svg ────────────
// «Rung-peak»: 4 σκαλοπάτια στοιβαγμένα σε σιλουέτα κορυφής (viewBox 64).
const RUNGS = [
  { x: 28, y: 9, w: 8 },
  { x: 21, y: 22, w: 22 },
  { x: 14, y: 35, w: 36 },
  { x: 7, y: 48, w: 50 },
];
const RUNG_H = 7;
const RUNG_RX = 3.5;

// ── Altitude Violet palette (docs/DESIGN-SPEC-V2.md) ───────────────────────
const VIOLET_A = '#7C3AED'; // gradient stop 0 — σκοτεινότερο
const VIOLET_B = '#B88CFF'; // gradient stop 1 — accent-glow
const WHITE = '#F3F1F8'; // text-primary — το σήμα στο app icon
const GOLD = '#FBBF24'; // achievement — μόνο για summit
const BG = '#0C0A14'; // bg-base — near-black με μωβ χροιά

/** Το σήμα (4 rungs) σε δεδομένο viewBox 64, χρώμα ή gradient url(#id). */
const mark = (fill, { summit = false, gradientId } = {}) => {
  const color = gradientId ? `url(#${gradientId})` : fill;
  const bars = RUNGS.map((r, i) => {
    const c = summit && i === 0 ? GOLD : color;
    return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${RUNG_H}" rx="${RUNG_RX}" fill="${c}"/>`;
  });
  return `<g>${bars.join('')}</g>`;
};

const gradientDefs = (id) => `<defs>
  <linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="${VIOLET_A}"/>
    <stop offset="1" stop-color="${VIOLET_B}"/>
  </linearGradient>
</defs>`;

const svg = (body, w = 64, h = 64, vb = '0 0 64 64') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}">${body}</svg>\n`;

/**
 * Το σήμα μέσα σε rounded-square. Λευκό σήμα σε near-black βάση — ένα app
 * icon δεν αλλάζει χρώμα με το accent του χρήστη.
 */
const inSquare = (scale, radius, { color = WHITE, summit = false } = {}) => `
  <rect width="64" height="64" rx="${radius}" fill="${BG}"/>
  <g transform="translate(32,32) scale(${scale}) translate(-32,-32)">${mark(color, { summit })}</g>`;

const files = {
  // Το «γυμνό» σήμα, gradient — για inline χρήση/έγγραφα
  'logo.svg': svg(`${gradientDefs('anabasis-logo')}${mark(null, { gradientId: 'anabasis-logo' })}`),
  'logo-white.svg': svg(mark(WHITE)),
  // Favicon: οι 4 μπάρες διαβάζονται καθαρά ακόμα και στα 16px του tab
  'favicon.svg': svg(`${gradientDefs('anabasis-favicon')}${mark(null, { gradientId: 'anabasis-favicon' })}`),
  // App icon (PWA/Apple): container + λευκό σήμα σε near-black βάση
  'app-icon.svg': svg(inSquare(0.72, 14.5), 64, 64),
  // Maskable: μικρότερο σήμα ώστε να μένει μέσα στο 80% safe-zone circle
  // του Android (βλ. https://web.dev/maskable-icon/) κατά το circular crop
  'app-icon-maskable.svg': svg(inSquare(0.6, 0), 64, 64),
};

for (const [name, content] of Object.entries(files)) {
  writeFileSync(resolve(PUB, name), content);
}

// ── OG / social preview 1200×630 ──────────────────────────────────────────
// Near-black βάση, το σήμα σε gradient + «Anabasis» σε Fira Sans Condensed.
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="${BG}"/>
  ${gradientDefs('anabasis-og')}
  <g opacity="0.05" transform="translate(760,20) scale(11)">${mark(null, { gradientId: 'anabasis-og' })}</g>
  <g transform="translate(120,167) scale(4.7)">${mark(null, { gradientId: 'anabasis-og' })}</g>
  <text x="470" y="292" fill="${WHITE}" font-family="'Fira Sans Condensed', Inter, system-ui, sans-serif"
        font-size="76" font-weight="600" letter-spacing="6">ANABASIS</text>
  <text x="474" y="348" fill="${VIOLET_B}" font-family="'Fira Sans Condensed', Inter, system-ui, sans-serif"
        font-size="26" font-weight="500" letter-spacing="6">RISE. PROGRESS. BECOME.</text>
  <rect x="474" y="386" width="88" height="4" rx="2" fill="${GOLD}"/>
  <text x="474" y="440" fill="#A8A2BC" font-family="Manrope, Inter, system-ui, sans-serif"
        font-size="27">Weighted calisthenics &amp; skill progression · offline-first</text>
  <text x="474" y="484" fill="#6B6480" font-family="Manrope, Inter, system-ui, sans-serif"
        font-size="24" letter-spacing="1">anabasis.axonos.dev</text>
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
