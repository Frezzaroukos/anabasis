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

async function startAdHocWorkout(page, title) {
  await page.goto(`${baseUrl}/calendar`, { waitUntil: 'networkidle' });
  await skipOnboarding(page);
  await checkOverflow(page, 'calendar');
  await page.getByRole('button', { name: 'Add workout', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByPlaceholder('leg day, push A...').fill(title);
  await sheet.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForURL('**/workout/active');
}

async function addExercise(page, name) {
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
  const addSheet = page.getByRole('dialog');
  await addSheet.getByPlaceholder('Search or type any exercise…').fill(name);
  const create = addSheet.getByRole('button', { name: `Use "${name}"`, exact: true });
  if (await create.isVisible().catch(() => false)) {
    await create.click();
  } else {
    await addSheet.getByRole('button', { name, exact: true }).click();
  }
  await addSheet.waitFor({ state: 'detached' });
}

async function logSet(page, weight, reps) {
  await page.getByLabel(/^Weight/).fill(String(weight));
  await page.getByLabel('Reps').fill(String(reps));
  await page.getByRole('button', { name: 'Add set', exact: true }).click();
  await expectText(page, `${weight}kg × ${reps}`);
}

async function finishWorkout(page) {
  await page.getByRole('button', { name: 'Save workout', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Save workout', exact: true }).click();
  await page.waitForURL(/\/history\/[^/]+$/);
}

async function addWorkout(page) {
  await startAdHocWorkout(page, 'E2E Smoke');
  await addExercise(page, 'Back Squat');
  await logSet(page, 60, 5);
  await page.getByLabel('Reps').fill('5');
  await page.getByRole('button', { name: 'Add set', exact: true }).click();
  await page.locator('text=60kg × 5').nth(1).waitFor({ state: 'visible', timeout: 8000 });
  await checkOverflow(page, 'active workout');
}

async function flow1(page) {
  await addWorkout(page);
  await finishWorkout(page);
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
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Workouts (CSV)', exact: true }).click(),
  ]);
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

async function flow7(page) {
  await openDetail(page);
  const before = await page.getByRole('button', { name: 'Delete', exact: true }).count();
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
  const status = page.getByRole('status');
  await status.getByText('Set deleted', { exact: false }).waitFor({ state: 'visible' });
  await status.getByRole('button', { name: 'Undo', exact: true }).click();
  await page
    .getByRole('button', { name: 'Delete', exact: true })
    .nth(before - 1)
    .waitFor({ state: 'visible' });

  await page.getByRole('button', { name: 'Remove exercise', exact: true }).first().click();
  const confirm = page.getByRole('dialog');
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  const toast = page.getByRole('status');
  await toast.getByText('Exercise removed', { exact: false }).waitFor({ state: 'visible' });
  await toast.getByRole('button', { name: 'Undo', exact: true }).click();
  await expectText(page, 'Back Squat');
  return 'set delete + undo; exercise delete + undo';
}

async function flow8(page) {
  const tomorrow = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return {
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      day: d.getDate(),
      month: d.getMonth(),
    };
  });
  await page.goto(`${baseUrl}/calendar`, { waitUntil: 'networkidle' });
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'Schedule session', exact: true }).click();
  let sheet = page.getByRole('dialog');
  await sheet.getByLabel('Title').fill('Plan Tomorrow');
  await sheet.getByLabel('Date').fill(tomorrow.iso);
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await sheet.waitFor({ state: 'detached' });

  const now = new Date();
  if (tomorrow.month !== now.getMonth()) {
    await page.getByRole('button', { name: 'Next month', exact: true }).click();
  }
  if (!(await page.locator('[title="Planned"]').first().isVisible().catch(() => false))) {
    throw new Error('planned marker did not appear on the calendar');
  }
  await page.locator('button').filter({ hasText: new RegExp(`^${tomorrow.day}$`) }).first().click();
  await page.getByText('Plan Tomorrow', { exact: false }).first().click();
  sheet = page.getByRole('dialog');
  await sheet.getByLabel('Title').fill('Plan Tomorrow Edited');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await sheet.waitFor({ state: 'detached' });
  await expectText(page, 'Plan Tomorrow Edited');

  await page.getByText('Plan Tomorrow Edited', { exact: false }).first().click();
  sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Delete this planned session?', exact: true }).click();
  await sheet.getByRole('button', { name: 'Delete', exact: true }).click();
  await sheet.waitFor({ state: 'detached' });
  await expectGone(page, 'Plan Tomorrow Edited');
  await checkOverflow(page, 'calendar planner');

  // Σημερινό planned → κάρτα «Today in your plan» → Start → Save → done.
  await page.goto(`${baseUrl}/calendar`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Schedule session', exact: true }).click();
  sheet = page.getByRole('dialog');
  await sheet.getByLabel('Title').fill('Plan Today');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await sheet.waitFor({ state: 'detached' });

  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await expectText(page, 'Today in your plan');
  await expectText(page, 'Plan Today');
  await checkOverflow(page, 'dashboard');

  // Start κατευθείαν από την κάρτα «Σήμερα στο πρόγραμμα» (D4 finding) —
  // ίδια ροή με το calendar sheet, χωρίς δεύτερη πλοήγηση.
  await page.getByRole('button', { name: 'Start Plan Today', exact: true }).click();
  await page.waitForURL('**/workout/active');
  await addExercise(page, 'Back Squat');
  await logSet(page, 50, 5);
  await finishWorkout(page);
  await page.goto(`${baseUrl}/calendar`, { waitUntil: 'networkidle' });
  const row = page.getByText('Plan Today', { exact: false }).first().locator('xpath=ancestor::li');
  await row.getByText('Done', { exact: false }).waitFor({ state: 'visible' });
  return 'tomorrow planned created/edited/deleted; today planned started and done';
}

async function flow9(page) {
  await page.goto(`${baseUrl}/goals`, { waitUntil: 'networkidle' });
  await checkOverflow(page, 'goals');
  await page.getByRole('button', { name: 'New goal', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await sheet.waitFor({ state: 'detached' });
  await expectText(page, '4 sessions');

  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('button', { name: /Show archived \(1\)/ }).click();
  await page.getByRole('button', { name: 'Unarchive', exact: true }).click();
  await page.getByRole('button', { name: 'Archive', exact: true }).waitFor({ state: 'visible' });
  return 'created → archived → shown → unarchived';
}

async function flow10(page) {
  await page.goto(`${baseUrl}/programs`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'New program', exact: true }).click();
  await page.getByLabel('Name').fill('E2E Program');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForURL(/\/programs\/[^/]+$/);
  await expectText(page, 'E2E Program');

  await page.getByRole('button', { name: /Add description/ }).click();
  await page.getByLabel('Description').fill('Built by the D4 e2e smoke.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectText(page, 'Built by the D4 e2e smoke.');

  await page.goto(`${baseUrl}/programs`, { waitUntil: 'networkidle' });
  await checkOverflow(page, 'programs');
  const row = page.getByText('E2E Program', { exact: false }).first().locator('xpath=ancestor::li');
  await row.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await page.waitForURL(/\/programs\/[^/]+$/);
  await expectText(page, 'E2E Program (2)');
  return 'created, description edited, duplicated';
}

async function flow11(page) {
  await page.goto(`${baseUrl}/exercises`, { waitUntil: 'networkidle' });
  await checkOverflow(page, 'exercises');
  await page.getByRole('button', { name: 'New exercise', exact: true }).click();
  let sheet = page.getByRole('dialog');
  await sheet.getByLabel('Name').fill('E2E Temp Exercise');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await sheet.waitFor({ state: 'detached' });
  await expectText(page, 'E2E Temp Exercise');

  let row = page
    .getByText('E2E Temp Exercise', { exact: false })
    .first()
    .locator('xpath=ancestor::li');
  await row.getByRole('button', { name: 'Edit exercise', exact: true }).click();
  sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Delete exercise', exact: true }).click();
  let confirm = page.getByRole('dialog', { name: 'Delete this exercise?' });
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await confirm.waitFor({ state: 'detached' });
  await expectGone(page, 'E2E Temp Exercise');

  // Με ιστορικό: το delete πρέπει να μπλοκάρεται με εξήγηση.
  await page.getByRole('button', { name: 'New exercise', exact: true }).click();
  sheet = page.getByRole('dialog');
  await sheet.getByLabel('Name').fill('E2E History Lift');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await sheet.waitFor({ state: 'detached' });

  await startAdHocWorkout(page, 'E2E History Workout');
  await addExercise(page, 'E2E History Lift');
  await logSet(page, 40, 5);
  await finishWorkout(page);

  await page.goto(`${baseUrl}/exercises`, { waitUntil: 'networkidle' });
  row = page.getByText('E2E History Lift', { exact: false }).first().locator('xpath=ancestor::li');
  await row.getByRole('button', { name: 'Edit exercise', exact: true }).click();
  sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Delete exercise', exact: true }).click();
  confirm = page.getByRole('dialog', { name: 'Delete this exercise?' });
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expectText(page, 'used in your history');
  await expectText(page, 'E2E History Lift');
  return 'no-history delete confirmed; history delete blocked';
}

async function flow12(page) {
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.press('Tab');
  await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) throw new Error('no focus after Tab');
    if (!el.textContent?.includes('Skip to main content')) {
      throw new Error(`first Tab focused ${el.tagName}: ${el.textContent?.slice(0, 60)}`);
    }
  });
  await page.keyboard.press('Enter');
  const id = await page.evaluate(() => document.activeElement?.id ?? '');
  if (id !== 'main') throw new Error(`Enter on skip link focused #${id || '(none)'} instead of #main`);
  return 'skip link is first tab stop and moves focus to main';
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
    ['7. set/exercise delete + undo', flow7],
    ['8. planner create/edit/delete + done', flow8],
    ['9. goals archive/unarchive', flow9],
    ['10. programs create/edit/duplicate', flow10],
    ['11. exercise delete + blocked', flow11],
    ['12. keyboard skip link', flow12],
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
if (failures.length === 0 && results.length === VIEWPORTS.length * 12) {
  console.log('\nE2E smoke: PASS');
  process.exitCode = 0;
} else {
  console.log(`\nE2E smoke: FAIL (${failures.length} failing flow/viewport pairs)`);
  console.log(`screenshots: ${SHOTS}`);
  process.exitCode = 1;
}
