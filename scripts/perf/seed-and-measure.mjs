#!/usr/bin/env node
/**
 * Scale timing for the local-first pages.
 *
 * Seeds ~300 finished workouts × 20 sets (about two years) into the real
 * IndexedDB of a production preview, then records how long each page takes
 * to show its data — not just the route shell.
 *
 *   npm run e2e:perf
 *   PERF_SKIP_BUILD=1 PERF_OUT=/tmp/anabasis-perf-build node scripts/perf/seed-and-measure.mjs
 *
 * Builds with `vite build` into /tmp (never `npm run build`). Serves that
 * folder with `vite preview` on a free loopback port and kills only that
 * process. Playwright drives the browser. No live service is touched.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '../..');
const VITE = join(ROOT, 'node_modules/vite/bin/vite.js');
const OUT = process.env.PERF_OUT || '/tmp/anabasis-perf-runtime';
const SKIP_BUILD = process.env.PERF_SKIP_BUILD === '1';
const WORKOUTS = 300;
const SETS_PER = 20;
const SPAN_DAYS = 730;
const ROUNDS = 3;
const USER = 'local-user-00000-0000-4000-8000-000000000001';

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

function build() {
  console.log(`building ${OUT} …`);
  const result = spawnSync(
    process.execPath,
    [VITE, 'build', '--outDir', OUT, '--emptyOutDir'],
    { cwd: ROOT, stdio: 'inherit' },
  );
  if (result.status !== 0) throw new Error(`vite build failed (${result.status})`);
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

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Executable doesn't exist") && !message.includes('browserType.launch')) {
      throw error;
    }
    return chromium.launch({ headless: true, executablePath: '/usr/bin/brave' });
  }
}

/** Median of a non-empty list of numbers. */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function seed(page) {
  return page.evaluate(
    async ({ userId, workouts, setsPer, spanDays }) => {
      const open = () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open('anabasis');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result);
        });
      const db = await open();
      const exercises = await new Promise((resolve, reject) => {
        const tx = db.transaction('exercises', 'readonly');
        const req = tx.objectStore('exercises').getAll();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });
      const library = exercises.filter((row) => row.deleted_at == null).slice(0, 4);
      if (library.length === 0) throw new Error('no exercises in IndexedDB');

      const clear = (storeName) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite');
          const req = tx.objectStore(storeName).clear();
          req.onerror = () => reject(req.error);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      await clear('workouts');
      await clear('sets');

      const now = new Date();
      const workoutRows = [];
      const setRows = [];
      for (let i = 0; i < workouts; i += 1) {
        const when = new Date(now);
        when.setDate(now.getDate() - Math.floor((i * spanDays) / workouts));
        when.setHours(12, 0, 0, 0);
        const started = when.toISOString();
        const id = `perf-w-${i}`;
        workoutRows.push({
          id,
          user_id: userId,
          started_at: started,
          ended_at: started,
          duration_seconds: 3600,
          notes: null,
          workout_type: i % 2 === 0 ? 'Push' : 'Pull',
          activity_kind: 'strength',
          program_id: null,
          program_day_id: null,
          distance_km: null,
          feel: 3,
          created_at: started,
          updated_at: started,
          deleted_at: null,
        });
        const exercise = library[i % library.length];
        for (let n = 1; n <= setsPer; n += 1) {
          setRows.push({
            id: `perf-s-${i}-${n}`,
            workout_id: id,
            exercise_id: exercise.id,
            set_number: n,
            weight_kg: 40 + (n % 5) * 2.5,
            bodyweight_kg: null,
            reps: 5,
            rest_pause_reps: [],
            hold_seconds: null,
            rpe: null,
            rir: null,
            tempo: null,
            is_warmup: false,
            is_failure: false,
            set_type: 'normal',
            group_id: null,
            notes: null,
            rest_seconds: null,
            created_at: started,
            updated_at: started,
            deleted_at: null,
          });
        }
      }

      const putAll = (storeName, rows) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          for (const row of rows) store.put(row);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      await putAll('workouts', workoutRows);
      const chunk = 1000;
      for (let i = 0; i < setRows.length; i += chunk) {
        await putAll('sets', setRows.slice(i, i + chunk));
      }

      const bench = await new Promise((resolve, reject) => {
        const tx = db.transaction('sets', 'readonly');
        const store = tx.objectStore('sets');
        const index = store.index('workout_id');
        const monthIds = workoutRows.slice(0, 12).map((row) => row.id);
        const allIds = workoutRows.map((row) => row.id);
        const time = async (label, run) => {
          const t0 = performance.now();
          const rows = await run();
          return { label, ms: Math.round(performance.now() - t0), rows: rows.length };
        };
        const full = () =>
          new Promise((res, rej) => {
            const req = store.getAll();
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
          });
        const byIds = (ids) =>
          Promise.all(
            ids.map(
              (id) =>
                new Promise((res, rej) => {
                  const req = index.getAll(id);
                  req.onsuccess = () => res(req.result);
                  req.onerror = () => rej(req.error);
                }),
            ),
          ).then((groups) => groups.flat());
        Promise.all([
          time('sets.getAll', full),
          time('index workout_id ×12', () => byIds(monthIds)),
          time('index workout_id ×300', () => byIds(allIds)),
        ])
          .then(resolve)
          .catch(reject);
      });

      db.close();
      return {
        workouts: workoutRows.length,
        sets: setRows.length,
        exerciseId: library[0].id,
        exerciseName: library[0].name,
        bench,
      };
    },
    { userId: USER, workouts: WORKOUTS, setsPer: SETS_PER, spanDays: SPAN_DAYS },
  );
}

async function elapsedUntil(page, path, ready) {
  const started = performance.now();
  await page.goto(path, { waitUntil: 'commit' });
  await ready();
  return Math.round(performance.now() - started);
}

async function main() {
  if (!SKIP_BUILD) build();
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const preview = spawn(
    process.execPath,
    [VITE, 'preview', '--outDir', OUT, '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' },
  );
  const stop = () => {
    if (preview.exitCode === null) preview.kill('SIGTERM');
  };
  process.on('exit', stop);

  try {
    await waitForServer(origin, preview);
    const browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
    await page.addInitScript(() => {
      localStorage.setItem('anabasis.onboarded', '1');
      localStorage.setItem('anabasis.safety.ack', '1');
      localStorage.setItem('sa.lang', 'en');
    });
    page.on('pageerror', (error) => {
      console.error(`PAGEERROR ${error.message}`);
    });

    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Overview' }).waitFor({ timeout: 30_000 });
    const seeded = await seed(page);
    console.log(
      `seeded ${seeded.workouts} workouts × ${SETS_PER} sets = ${seeded.sets} sets, exercise ${seeded.exerciseName}`,
    );
    for (const row of seeded.bench) {
      console.log(`BENCH ${row.label}: ${row.ms} ms (${row.rows} rows)`);
    }

    await page.reload({ waitUntil: 'commit' });
    await page.getByRole('heading', { name: 'Overview' }).waitFor({ timeout: 30_000 });

    const routes = [
      {
        name: 'Dashboard',
        path: '/',
        ready: () => page.getByRole('heading', { name: 'Overview' }).waitFor({ timeout: 30_000 }),
      },
      {
        name: 'History',
        path: '/history',
        ready: () => page.getByText(`${WORKOUTS} completed sessions`).waitFor({ timeout: 30_000 }),
      },
      {
        name: 'Calendar',
        path: '/calendar',
        ready: () => page.getByText(/workout(s)? this month/).waitFor({ timeout: 30_000 }),
      },
      {
        name: 'Progress',
        path: '/progress',
        ready: () => page.getByText(/Last trained/).first().waitFor({ timeout: 30_000 }),
      },
      {
        name: 'Exercise detail',
        path: `/exercises/${seeded.exerciseId}`,
        ready: () => page.getByText('Last performed').waitFor({ timeout: 30_000 }),
      },
    ];

    const results = [];
    for (const route of routes) {
      const samples = [];
      for (let round = 0; round < ROUNDS; round += 1) {
        const ms = await elapsedUntil(page, `${origin}${route.path}`, route.ready);
        samples.push(ms);
        console.log(`${route.name} run ${round + 1}: ${ms} ms`);
      }
      results.push({ name: route.name, samples, median: median(samples) });
    }

    console.log('\npage                    median ms   samples');
    for (const row of results) {
      console.log(
        `${row.name.padEnd(22)} ${String(row.median).padStart(8)}   ${row.samples.join(', ')}`,
      );
    }
    console.log(`PERF_JSON ${JSON.stringify({ seeded, results })}`);
    await browser.close();
  } finally {
    stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
