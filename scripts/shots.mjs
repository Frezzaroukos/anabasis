#!/usr/bin/env node
/**
 * Screenshots του live app σε μέγεθος κινητού, με ΠΡΑΓΜΑΤΙΚΑ δεδομένα seed
 * μέσα στο IndexedDB — ώστε να βλέπουμε το UI όπως το βλέπει χρήστης που
 * ήδη προπονείται, όχι άδειες κάρτες.
 *
 *   node scripts/shots.mjs [baseUrl] [outDir]
 *
 * Χρησιμοποιεί το bundled chromium του Playwright (δεν αγγίζει τον Brave).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:8120';
const OUT = process.argv[3] ?? '/tmp/anabasis-shots';
mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['/', 'dashboard'],
  ['/calendar', 'calendar'],
  ['/skills', 'skills'],
  ['/progress', 'progress'],
  ['/branding', 'branding'],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
});
// Το onboarding overlay θα σκέπαζε κάθε screenshot — το μαρκάρουμε ως δει.
await ctx.addInitScript(() => {
  globalThis.localStorage?.setItem('anabasis.onboarded', '1');
});

const page = await ctx.newPage();

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// Ελάχιστη «ζωντανή» κατάσταση: ένα skill σε εξέλιξη, ώστε να φαίνεται η
// σκάλα στο dashboard αντί για άδειες κάρτες.
try {
  await page.goto(`${BASE}/skills`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.locator('a[href^="/skills/"]').first().click();
  await page.waitForTimeout(800);
  const achieve = page.getByRole('button', { name: /achieved|πέτυχα/i }).first();
  if (await achieve.count()) {
    await achieve.click();
    await page.waitForTimeout(600);
  }
} catch (err) {
  console.warn('seed skipped:', err.message);
}

for (const [path, name] of PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`✓ ${name}`);
}

await browser.close();
console.log(`→ ${OUT}`);
