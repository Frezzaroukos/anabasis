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

// ── Πηγή αλήθειας: ίδια γεωμετρία με το src/components/Logo.tsx ───────────
// «Άλφα με σκάλα»: σκέλη Λ + σκαλιά μέσα στο counter + κορυφή.
const APEX_Y = 60;
const FOOT_Y = 452;
const CX = 256;
const HALF_RUN = 196;
const SW = 48;
const SLOPE = HALF_RUN / (FOOT_Y - APEX_Y); // 0.5
const H_THICK = SW * Math.sqrt(1 + SLOPE ** 2); // οριζόντιο πάχος σκέλους

const LEG = `M${CX - HALF_RUN} ${FOOT_Y} L${CX} ${APEX_Y} L${CX + HALF_RUN} ${FOOT_Y}`;

/** Μισό πλάτος του εσωτερικού κενού σε ύψος y. */
const counterHalf = (y) => Math.max(0, SLOPE * (y - APEX_Y) - H_THICK / 2);

// inset 0 → τα σκαλιά αγγίζουν τα σκέλη, όπως στο brand sheet.
const PRESETS = {
  4: { top: 236, gap: 26, h: 24, inset: 0 },
  2: { top: 282, gap: 44, h: 34, inset: 0 },
};

const BLUE = '#2F81F7'; // Electric Blue family — ίδιο με το --primary του app
const WHITE = '#F7F7F7'; // Ghost White — το σήμα στο app icon, όπως στο brand sheet
const GOLD = '#E0B341';
const BG = '#0D1117'; // Deep Charcoal

const mark = (color, { summit = false, rungs = 4 } = {}) => {
  const { top, gap, h, inset } = PRESETS[rungs];
  const bars = [];
  for (let i = 0, y = top; i < rungs; i++, y += h + gap) {
    const half = counterHalf(y) - inset;
    if (half <= 6) continue;
    bars.push(
      `<rect x="${(CX - half).toFixed(1)}" y="${y}" width="${(2 * half).toFixed(1)}" height="${h}" rx="3" fill="${color}"/>`,
    );
  }
  const ty = top - gap - 4;
  const th = counterHalf(ty) - inset;
  const apex = `<path d="M${CX} ${(ty - 2 * th).toFixed(1)} L${(CX - th).toFixed(1)} ${ty} L${(CX + th).toFixed(1)} ${ty} Z" fill="${summit ? GOLD : color}"/>`;

  // Το miter join προεξέχει ~54u πάνω από το apex — το 0.9 κρατά το σήμα μέσα.
  return `<g transform="translate(256,256) scale(0.9) translate(-256,-256)">
  <path d="${LEG}" fill="none" stroke="${color}" stroke-width="${SW}"
        stroke-linecap="butt" stroke-linejoin="miter"/>
  ${apex}${bars.join('')}</g>`;
};

const svg = (body, w = 512, h = 512, vb = '0 0 512 512') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}">${body}</svg>\n`;

/**
 * Το σήμα μέσα σε rounded-square. Το app icon είναι ΛΕΥΚΟ σε ανθρακί —
 * ακριβώς όπως το brand sheet (πάνελ «03 / APP ICON»). Το μπλε μένει για το
 * UI, όπου παίρνει το accent του χρήστη· ένα app icon δεν αλλάζει χρώμα.
 */
const inSquare = (scale, radius, { color = WHITE, summit = false, rungs = 4 } = {}) => `
  <rect width="512" height="512" rx="${radius}" fill="${BG}"/>
  <g transform="translate(256,258) scale(${scale}) translate(-256,-256)">${mark(color, { summit, rungs })}</g>`;

const files = {
  // Το «γυμνό» σήμα — για inline χρήση/έγγραφα
  'logo.svg': svg(mark(BLUE, { summit: true })),
  'logo-white.svg': svg(mark(WHITE)),
  // Favicon: 2 σκαλιά — στα 16px του tab τα 4 κλείνουν οπτικά μεταξύ τους
  'favicon.svg': svg(mark(BLUE, { summit: true, rungs: 2 })),
  // App icon (PWA/Apple): container + safe area
  'app-icon.svg': svg(inSquare(0.78, 116)),
  // Maskable: πιο μικρό σήμα, ώστε να αντέχει το circular crop του Android
  'app-icon-maskable.svg': svg(inSquare(0.62, 0)),
};

for (const [name, content] of Object.entries(files)) {
  writeFileSync(resolve(PUB, name), content);
}

// ── OG / social preview 1200×630 ──────────────────────────────────────────
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="${BG}"/>
  <g opacity="0.045" transform="translate(700,40) scale(1.05)">${mark('#FFFFFF')}</g>
  <g transform="translate(84,132) scale(0.72)">${mark(BLUE, { summit: true })}</g>
  <text x="470" y="292" fill="#F7F7F7" font-family="Inter, system-ui, sans-serif"
        font-size="76" font-weight="700" letter-spacing="12">ANABASIS</text>
  <text x="474" y="348" fill="${BLUE}" font-family="Inter, system-ui, sans-serif"
        font-size="26" letter-spacing="6">RISE. PROGRESS. BECOME.</text>
  <rect x="474" y="386" width="88" height="4" rx="2" fill="${GOLD}"/>
  <text x="474" y="440" fill="#8A97A8" font-family="Inter, system-ui, sans-serif"
        font-size="27">Weighted calisthenics &amp; skill progression · offline-first</text>
  <text x="474" y="484" fill="#5C6B7E" font-family="Inter, system-ui, sans-serif"
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
