#!/usr/bin/env node
/**
 * End-to-end smoke for the local-first paths changed in the D lanes.
 *
 * The script builds a throwaway production bundle into /tmp, serves it with
 * `vite preview` on a free loopback port, and drives the real app with the
 * Playwright library (not @playwright/test). Every browser context starts with
 * an empty IndexedDB, so the flows run offline against a fresh local profile —
 * no login, no sync API (routes under /api are blocked).
 *
 * Usage: node scripts/e2e/smoke.mjs
 * Exit code 0 only when every flow passes at 390px and 320px with no console
 * errors, page errors or horizontal overflow.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '../..');
const VITE = join(ROOT, 'node_modules/vite/bin/vite.js');
const OUT = '/tmp/anabasis-e2e';
const SHOTS = '/tmp/anabasis-e2e-shots';
const RESERVED_PORTS = new Set([4000, 5173, 8120, 8121]);
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 320, height: 640 },
];

const results = [];
let currentViewport = '';

function pass(flow, detail = '') {
  results.push({ flow, viewport: currentViewport, ok: true, detail });
  console.log(`PASS [${currentViewport}] ${flow}${detail ? ` — ${detail}` : ''}`);
}

function fail(flow, error) {
  const detail = error instanceof Error ? error.message : String(error);
  results.push({ flow, viewport: currentViewport, ok: false, detail });
  console.log(`FAIL [${currentViewport}] ${flow} — ${detail}`);
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`vite preview exited with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Still starting.
    }
    await new Promise((r) => setTimeout(r, 125));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function build() {
  console.log(`building ${OUT} …`);
  const result = spawnSync(
    process.execPath,
    [VITE, 'build', '--outDir', OUT, '--emptyOutDir'],
    { cwd: ROOT, stdio: 'inherit' },
  );
  if (result.status !== 0) throw new Error(`vite build failed (${result.status})`);
}

async function checkOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    viewport: window.innerWidth,
  }));
  const widest = Math.max(metrics.doc, metrics.body);
  if (widest > metrics.viewport + 1) {
    throw new Error(
      `${label}: horizontal overflow ${widest}px > viewport ${metrics.viewport}px`,
    );
  }
}

async function expectText(page, text) {
  const locator = page.getByText(text, { exact: false }).first();
  await locator.waitFor({ state: 'visible', timeout: 8000 });
}

async function expectGone(page, text) {
  const locator = page.getByText(text, { exact: false }).first();
  await locator.waitFor({ state: 'detached', timeout: 8000 });
}

async function skipOnboarding(page) {
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(150);
  }
}

function contextOptions(width, height) {
  return {
    viewport: { width, height },
    locale: 'en-US',
    timezoneId: 'Europe/Athens',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  };
}

async function addWorkout(page) {
  await page.goto(`${baseUrl}/calendar`, { waitUntil: 'networkidle' });
  await skipOnboarding(page);
  await checkOverflow(page, 'calendar');
  await page.getByRole('button', { name: 'Add workout', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByPlaceholder('leg day, push A...').fill('E2E Smoke');
  await sheet.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForURL('**/workout/active');

  await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
  const addSheet = page.getByRole('dialog');
  await addSheet.getByPlaceholder('Search or type any exercise…').fill('Back Squat');
  await addSheet.getByRole('button', { name: 'Back Squat', exact: true }).click();
  await addSheet.waitFor({ state: 'detached' });

  // Two sets on the one exercise.
  await page.getByLabel('Weight (kg)').fill('60');
  await page.getByLabel('Reps').fill('5');
  await page.getByRole('button', { name: 'Add set', exact: true }).click();
  await expectText(page, '60kg × 5');
  await page.getByLabel('Reps').fill('5');
  await page.getByRole('button', { name: 'Add set', exact: true }).click();
  await page.locator('text=60kg × 5').nth(1).waitFor({ state: 'visible', timeout: 8000 });
  await checkOverflow(page, 'active workout');
}

async function flow1(page) {
  await addWorkout(page);
  await page.getByRole('button', { name: 'Save workout', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Save workout', exact: true }).click();
  await page.waitForURL(/\/history\/[^/]+$/);
  await page.goto(`${baseUrl}/history`, { waitUntil: 'networkidle' });
  await expectText(page, 'E2E Smoke');
  await checkOverflow(page, 'history');
  return `saved ${page.url()}`;
}

async function openDetail(page) {
  await page.goto(`${baseUrl}/history`, { waitUntil: 'networkidle' });
  await page.getByText('E2E Smoke', { exact: false }).first().click();
  await page.waitForURL(/\/history\/[^/]+$/);
  await expectText(page, 'Back Squat');
}

async function flow2(page) {
  await openDetail(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await page.getByLabel('Weight (kg)').fill('65');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('65kg × 5', { exact: false }).first().waitFor({ state: 'visible' });

  await page.reload({ waitUntil: 'networkidle' });
  await expectText(page, '65kg × 5');
  await checkOverflow(page, 'workout detail');
  return 'weight edit persisted after reload';
}

async function flow3(page) {
  await openDetail(page);
  const before = await page.getByRole('button', { name: 'Delete', exact: true }).count();
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
  await expectGone(page, '60kg × 5');
  const after = await page.getByRole('button', { name: 'Delete', exact: true }).count();
  if (after >= before) throw new Error(`set delete did not reduce rows (${before} → ${after})`);

  // Whole-workout delete is the path with a confirm + Undo toast.
  await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Delete this workout', exact: true }).click();
  await sheet.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForURL('**/history');

  const status = page.getByRole('status');
  await status.getByText('Workout deleted', { exact: false }).waitFor({ state: 'visible' });
  await status.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.waitForURL(/\/history\/[^/]+$/);
  await expectText(page, 'E2E Smoke');
  return 'set deleted; workout delete + undo restored';
}

async function flow4(page) {
  await page.goto(`${baseUrl}/body`, { waitUntil: 'networkidle' });
  await page.getByLabel(/^Weight/).fill('78.5');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectText(page, 'Recent entries');

  await page.getByRole('button', { name: 'Edit entry', exact: true }).click();
  await page.getByLabel(/^Weight/).fill('79.5');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectText(page, '79.5 kg');

  await page.getByRole('button', { name: 'Clear entry', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expectGone(page, '79.5 kg');
  await checkOverflow(page, 'body');
  return 'add → edit → confirmed delete';
}

async function flow5(page) {
  await page.goto(`${baseUrl}/settings/data`, { waitUntil: 'networkidle' });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Workouts (CSV)', exact: true }).click();
  const download = await downloadPromise;
  const file = await download.path();
  const text = readFileSync(file, 'utf8');
  if (!text.replace(/^\uFEFF/, '').startsWith('date,workout,activity')) {
    throw new Error(`unexpected CSV header: ${text.slice(0, 60)}`);
  }

  await page.getByRole('button', { name: 'Check now', exact: true }).click();
  await page
    .getByRole('status')
    .filter({ hasText: /No problems found|issues found/ })
    .first()
    .waitFor({ state: 'visible' });
  await checkOverflow(page, 'settings data');
  return `CSV ${download.suggestedFilename()} header ok; integrity ran`;
}

async function flow6(page) {
  await page.goto(`${baseUrl}/activities`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'New activity', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Name', { exact: true }).fill('E2E Archery');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expectText(page, 'E2E Archery');

  const row = page.getByText('E2E Archery', { exact: false }).first().locator('xpath=ancestor::li');
  await row.getByRole('button', { name: 'Delete activity', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expectGone(page, 'E2E Archery');
  await checkOverflow(page, 'activities');
  return 'custom activity created and deleted';
}

let baseUrl = '';
let preview;
let browser;

try {
  mkdirSync(SHOTS, { recursive: true });
  build();

  const port = await freePort();
  if (RESERVED_PORTS.has(port)) throw new Error(`freePort returned reserved port ${port}`);
  baseUrl = `http://127.0.0.1:${port}`;
  preview = spawn(
    process.execPath,
    [
      VITE,
      'preview',
      '--outDir',
      OUT,
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  await waitForServer(baseUrl, preview);
  console.log(`preview ${baseUrl} (pid ${preview.pid})`);

  try {
    browser = await chromium.launch({});
  } catch {
    browser = await chromium.launch({ executablePath: '/usr/bin/brave' });
  }

  const flows = [
    ['1. log a workout → history', flow1],
    ['2. edit a set weight → reload', flow2],
    ['3. delete set / workout + undo', flow3],
    ['4. body add → edit → delete', flow4],
    ['5. CSV export + integrity check', flow5],
    ['6. custom activity create → delete', flow6],
  ];

  for (const viewport of VIEWPORTS) {
    currentViewport = `${viewport.width}px`;
    const context = await browser.newContext(contextOptions(viewport.width, viewport.height));
    await context.route(`${baseUrl}/api/**`, (route) => route.abort('blockedbyclient'));
    const page = await context.newPage();
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

    for (const [name, flow] of flows) {
      const before = errors.length;
      try {
        const detail = await flow(page);
        if (errors.length > before) throw new Error(errors[before]);
        pass(name, detail);
      } catch (error) {
        const slug = name.split('.')[0];
        await page
          .screenshot({ path: join(SHOTS, `${viewport.width}-${slug}.png`), fullPage: true })
          .catch(() => {});
        fail(name, error);
      }
    }
    await context.close();
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (preview && preview.exitCode === null) {
    preview.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 800));
    if (preview.exitCode === null) preview.kill('SIGKILL');
  }
}

const failures = results.filter((result) => !result.ok);
console.log('\nflow | viewport | result');
for (const result of results) {
  console.log(`${result.flow} | ${result.viewport} | ${result.ok ? 'PASS' : 'FAIL'}`);
}
if (failures.length === 0 && results.length === VIEWPORTS.length * 6) {
  console.log('\nE2E smoke: PASS');
  process.exitCode = 0;
} else {
  console.log(`\nE2E smoke: FAIL (${failures.length} failing flow/viewport pairs)`);
  console.log(`screenshots: ${SHOTS}`);
  process.exitCode = 1;
}
