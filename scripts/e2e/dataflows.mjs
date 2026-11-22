#!/usr/bin/env node
/**
 * Data-flow e2e: πραγματικές ροές δεδομένων σε mobile browser (390×844).
 *
 * Χτίζει throwaway production bundle σε /tmp, το σερβίρει με `vite preview`
 * σε ελεύθερο loopback port και τρέχει 3 φορές (fresh context κάθε φορά) για
 * flakiness. Κάθε βήμα αφήνει screenshot στο /tmp/anabasis-e2e-flows/.
 *
 * Ροές: (1) προπόνηση 2 ασκήσεων × 3 σετ → ιστορικό, (2) edit βάρους → reload,
 * (3) delete σετ → undo, (4) delete προπόνησης → εξαφανίζεται, (5) σώμα
 * add/edit/delete, (6) planned σήμερα → Start από αρχική, (7) CSV export.
 *
 * Usage: node scripts/e2e/dataflows.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '../..');
const VITE = join(ROOT, 'node_modules/vite/bin/vite.js');
const OUT = '/tmp/anabasis-t-e2e-build';
const SHOTS = '/tmp/anabasis-e2e-flows';
const RESERVED_PORTS = new Set([4000, 5173, 8120, 8121]);
const RUNS = 3;
const VIEWPORT = { width: 390, height: 844 };

let baseUrl = '';
let preview = null;
let browser = null;
const results = [];

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

async function pickPort() {
  for (;;) {
    const port = await freePort();
    if (!RESERVED_PORTS.has(port)) return port;
  }
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
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

function contextOptions() {
  return {
    viewport: VIEWPORT,
    locale: 'en-US',
    timezoneId: 'Europe/Athens',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  };
}

async function goto(page, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  await skipOnboarding(page);
}

async function skipOnboarding(page) {
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(150);
  }
}

async function expectText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 8000 });
}

async function expectGone(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'detached', timeout: 8000 });
}

async function checkOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    viewport: window.innerWidth,
  }));
  const widest = Math.max(metrics.doc, metrics.body);
  if (widest > metrics.viewport + 1) {
    throw new Error(`${label}: horizontal overflow ${widest}px > ${metrics.viewport}px`);
  }
}

async function addExercise(page, name) {
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByPlaceholder('Search or type any exercise…').fill(name);
  const create = sheet.getByRole('button', { name: `Use "${name}"`, exact: true });
  if (await create.isVisible().catch(() => false)) {
    await create.click();
  } else {
    await sheet.getByRole('button', { name, exact: true }).click();
  }
  await sheet.waitFor({ state: 'detached' });
}

async function logSets(page, exercise, sets) {
  const card = page.getByRole('article').filter({ hasText: exercise });
  await card.waitFor({ state: 'visible', timeout: 8000 });
  for (const [weight, reps] of sets) {
    await card.getByLabel('Weight (kg)').fill(String(weight));
    await card.getByLabel('Reps').fill(String(reps));
    await card.getByRole('button', { name: 'Add set', exact: true }).click();
    await expectText(page, `${weight}kg × ${reps}`);
  }
}

async function finishWorkout(page) {
  await page.getByRole('button', { name: 'Save workout', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Save workout', exact: true }).click();
  await page.waitForURL(/\/history\/[^/]+$/);
}

async function openWorkout(page, title) {
  await goto(page, '/history');
  await page.getByText(title, { exact: false }).first().click();
  await page.waitForURL(/\/history\/[^/]+$/);
  await expectText(page, 'Back Squat');
}

// ───────────────────────── flows ─────────────────────────

async function flowWorkout(page, state, run) {
  state.workoutTitle = `Dataflows Run ${run}`;
  await goto(page, '/calendar');
  await page.getByRole('button', { name: 'Add workout', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByPlaceholder('leg day, push A...').fill(state.workoutTitle);
  await sheet.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForURL('**/workout/active');

  await addExercise(page, 'Back Squat');
  await logSets(page, 'Back Squat', [[60, 5], [65, 5], [70, 5]]);
  await addExercise(page, 'Bench Press');
  await logSets(page, 'Bench Press', [[40, 5], [45, 5], [50, 5]]);
  await checkOverflow(page, 'active workout');

  await finishWorkout(page);
  await goto(page, '/history');
  await expectText(page, state.workoutTitle);
  await checkOverflow(page, 'history');
  return '2 exercises × 3 sets saved; workout visible in history';
}

async function flowEditWeight(page, state) {
  await openWorkout(page, state.workoutTitle);
  await expectText(page, 'Bench Press');
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await page.getByLabel('Weight (kg)').fill('77.5');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectText(page, '77.5kg × 5');

  await page.reload({ waitUntil: 'networkidle' });
  await expectText(page, '77.5kg × 5');
  await checkOverflow(page, 'workout detail');
  return 'weight 77.5kg persisted after reload';
}

async function flowDeleteSet(page, state) {
  await openWorkout(page, state.workoutTitle);
  const before = await page.getByRole('button', { name: 'Delete', exact: true }).count();
  if (before < 6) throw new Error(`expected ≥6 sets before delete, found ${before}`);

  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
  const status = page.getByRole('status');
  await status.getByText('Set deleted', { exact: false }).waitFor({ state: 'visible', timeout: 8000 });
  const afterDelete = await page.getByRole('button', { name: 'Delete', exact: true }).count();
  if (afterDelete !== before - 1) {
    throw new Error(`set count ${before} → ${afterDelete}; expected ${before - 1}`);
  }

  await status.getByRole('button', { name: 'Undo', exact: true }).click();
  await page
    .getByRole('button', { name: 'Delete', exact: true })
    .nth(before - 1)
    .waitFor({ state: 'visible', timeout: 8000 });
  const afterUndo = await page.getByRole('button', { name: 'Delete', exact: true }).count();
  if (afterUndo !== before) throw new Error(`undo restored ${afterUndo}/${before} sets`);
  return `delete ${before}→${afterDelete}, undo→${afterUndo} sets`;
}

async function flowDeleteWorkout(page, state) {
  await openWorkout(page, state.workoutTitle);
  await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Delete this workout', exact: true }).click();
  const confirm = page.getByRole('dialog');
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForURL('**/history');
  await expectGone(page, state.workoutTitle);

  await page.reload({ waitUntil: 'networkidle' });
  const stillThere = await page.getByText(state.workoutTitle, { exact: false }).count();
  if (stillThere > 0) throw new Error('workout title still visible after reload');
  return 'workout deleted; gone after reload';
}

async function flowBody(page) {
  await goto(page, '/body');
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
  return 'body add → edit → confirmed delete';
}

async function flowPlanner(page) {
  await goto(page, '/calendar');
  await page.getByRole('button', { name: 'Schedule session', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Title').fill('Flow Plan');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await sheet.waitFor({ state: 'detached' });

  await goto(page, '/');
  await expectText(page, 'Today in your plan');
  await expectText(page, 'Flow Plan');
  await page.getByRole('button', { name: 'Start Flow Plan', exact: true }).click();
  await page.waitForURL('**/workout/active');

  await addExercise(page, 'Back Squat');
  await logSets(page, 'Back Squat', [[40, 5]]);
  await finishWorkout(page);
  return 'planned today started from home and finished';
}

async function flowCsv(page) {
  await goto(page, '/settings/data');
  const [workoutsDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Workouts (CSV)', exact: true }).click(),
  ]);
  const workoutsCsv = readFileSync(await workoutsDownload.path(), 'utf8').replace(/^\uFEFF/, '');
  const workoutLines = workoutsCsv.split(/\r?\n/).filter(Boolean);
  if (!workoutLines[0]?.startsWith('date,workout,activity')) {
    throw new Error(`unexpected workouts CSV header: ${workoutLines[0]?.slice(0, 60)}`);
  }
  if (workoutLines.length < 2) throw new Error('workouts CSV has no data rows');
  if (!workoutsCsv.includes('Flow Plan')) throw new Error('workouts CSV missing "Flow Plan"');

  const [setsDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Sets (CSV)', exact: true }).click(),
  ]);
  const setsCsv = readFileSync(await setsDownload.path(), 'utf8').replace(/^\uFEFF/, '');
  const setLines = setsCsv.split(/\r?\n/).filter(Boolean);
  if (!setLines[0]?.startsWith('date,workout,exercise')) {
    throw new Error(`unexpected sets CSV header: ${setLines[0]?.slice(0, 60)}`);
  }
  if (setLines.length < 2) throw new Error('sets CSV has no data rows');
  if (!setsCsv.includes('Back Squat')) throw new Error('sets CSV missing "Back Squat"');

  await checkOverflow(page, 'settings data');
  return `workouts ${workoutLines.length - 1} rows; sets ${setLines.length - 1} rows`;
}

// ───────────────────────── runner ─────────────────────────

async function shot(page, run, slug, ok) {
  const file = join(SHOTS, `run${run}-${slug}-${ok ? 'pass' : 'fail'}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
}

async function runStep(page, run, slug, name, fn, errors) {
  const before = errors.length;
  try {
    const detail = await fn();
    if (errors.length > before) throw new Error(`console error: ${errors[before]}`);
    const screenshot = await shot(page, run, slug, true);
    results.push({ run, slug, name, ok: true, detail, screenshot });
    console.log(`PASS [run ${run}] ${name} — ${detail}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const screenshot = await shot(page, run, slug, false);
    results.push({ run, slug, name, ok: false, detail, screenshot });
    console.log(`FAIL [run ${run}] ${name} — ${detail}`);
  }
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  build();

  const port = await pickPort();
  baseUrl = `http://127.0.0.1:${port}`;
  preview = spawn(
    process.execPath,
    [VITE, 'preview', '--outDir', OUT, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore' },
  );
  await waitForServer(baseUrl, preview);
  console.log(`preview ${baseUrl} (pid ${preview.pid})`);

  try {
    browser = await chromium.launch({});
  } catch {
    browser = await chromium.launch({ executablePath: '/usr/bin/brave' });
  }

  const steps = [
    ['1-workout', '1. workout: 2 exercises × 3 sets → history', flowWorkout],
    ['2-edit-weight', '2. edit a set weight → reload persists', flowEditWeight],
    ['3-delete-set', '3. delete a set → undo restores', flowDeleteSet],
    ['4-delete-workout', '4. delete workout → gone after reload', flowDeleteWorkout],
    ['5-body', '5. body weight add → edit → delete', flowBody],
    ['6-planner-start', '6. planner today → Start from home', flowPlanner],
    ['7-csv', '7. CSV export has rows', flowCsv],
  ];

  for (let run = 1; run <= RUNS; run += 1) {
    console.log(`\n=== RUN ${run}/${RUNS} ===`);
    const context = await browser.newContext(contextOptions());
    await context.route(`${baseUrl}/api/**`, (route) => route.abort('blockedbyclient'));
    const page = await context.newPage();
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

    const state = {};
    for (const [slug, name, fn] of steps) {
      await runStep(page, run, slug, name, () => fn(page, state, run), errors);
    }
    await context.close();
  }
}

try {
  await main();
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

const slugs = [...new Set(results.map((r) => r.slug))];
console.log('\nstep | run 1 | run 2 | run 3');
for (const slug of slugs) {
  const name = results.find((r) => r.slug === slug)?.name ?? slug;
  const cells = [1, 2, 3].map((run) => {
    const row = results.find((r) => r.run === run && r.slug === slug);
    return row ? (row.ok ? 'PASS' : 'FAIL') : '—';
  });
  console.log(`${name} | ${cells.join(' | ')}`);
}

const failures = results.filter((r) => !r.ok);
const flaky = slugs.filter((slug) => {
  const oks = results.filter((r) => r.slug === slug).map((r) => r.ok);
  return oks.some(Boolean) && oks.some((ok) => !ok);
});

if (failures.length > 0) {
  console.log('\nfailures:');
  for (const failure of failures) {
    console.log(`- [run ${failure.run}] ${failure.name} — ${failure.detail}`);
    console.log(`  screenshot: ${failure.screenshot}`);
  }
}
if (flaky.length > 0) {
  console.log(`\nFLAKY steps: ${flaky.join(', ')}`);
}
console.log(
  `\nDataflows: ${results.length - failures.length}/${results.length} steps passed` +
    (flaky.length ? ` · ${flaky.length} flaky` : '') +
    ` · screenshots in ${SHOTS}`,
);
process.exitCode = failures.length > 0 || flaky.length > 0 ? 1 : 0;
