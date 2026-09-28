#!/usr/bin/env node
/**
 * Generate the README screenshots from an isolated, local-only Demo profile.
 *
 * The browser gets a fresh temporary profile on every run. Synthetic training
 * data is written to the app's own IndexedDB origin; no account is created and
 * no request is made to the sync API.
 *
 * Usage: node scripts/screenshots/generate.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = join(ROOT, 'docs/screenshots');
const TEMP = mkdtempSync(join(tmpdir(), 'anabasis-shots-'));
const DEMO_USER = 'demo-user-00000-4000-8000-000000000001';

const PAGES = [
  ['/', 'dashboard'],
  ['/calendar', 'calendar'],
  ['/programs', 'programs'],
  ['/exercises', 'exercises'],
  ['/goals', 'goals'],
  ['/skills', 'skills'],
  ['/settings', 'settings'],
];

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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Vite exited with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 125));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function isoDaysAgo(days, hour = 18) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function demoRows() {
  const now = new Date().toISOString();
  const workouts = [];
  const sets = [];
  const pattern = [1, 3, 5, 8, 10, 13, 15, 18, 20, 22, 25, 27, 30, 33, 36, 39, 43, 47, 51, 55];
  const exerciseIds = [
    'ex-00000000-0000-4000-8000-000000000005', // Pull-ups
    'ex-00000000-0000-4000-8000-000000000004', // Dips
    'ex-00000000-0000-4000-8000-000000000008', // Pistol squat
  ];

  pattern.forEach((daysAgo, workoutIndex) => {
    const id = `demo-workout-${String(workoutIndex + 1).padStart(4, '0')}`;
    const startedAt = isoDaysAgo(daysAgo, 17 + (workoutIndex % 3));
    const endedAt = new Date(new Date(startedAt).getTime() + (52 + workoutIndex % 4 * 4) * 60_000).toISOString();
    workouts.push({
      id,
      user_id: DEMO_USER,
      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds: Math.round((new Date(endedAt) - new Date(startedAt)) / 1000),
      notes: workoutIndex % 5 === 0 ? 'Clean reps, steady tempo.' : null,
      workout_type: workoutIndex % 2 === 0 ? 'Upper strength' : 'Skills & legs',
      activity_kind: workoutIndex % 4 === 3 ? 'skill' : 'strength',
      program_id: 'demo-program-strength',
      program_day_id: workoutIndex % 2 === 0 ? 'demo-day-upper' : 'demo-day-skills',
      distance_km: null,
      feel: [4, 4, 5, 3][workoutIndex % 4],
      created_at: startedAt,
      updated_at: endedAt,
      deleted_at: null,
    });

    exerciseIds.forEach((exerciseId, exerciseIndex) => {
      for (let setIndex = 0; setIndex < 3; setIndex += 1) {
        const reps = Math.max(5, 10 - setIndex + Math.floor(workoutIndex / 7));
        const weight = exerciseIndex === 0 ? 10 + Math.floor(workoutIndex / 5) * 2.5 : exerciseIndex === 1 ? 15 + Math.floor(workoutIndex / 6) * 2.5 : 0;
        const createdAt = new Date(new Date(startedAt).getTime() + (exerciseIndex * 12 + setIndex * 3) * 60_000).toISOString();
        sets.push({
          id: `demo-set-${String(workoutIndex).padStart(2, '0')}-${exerciseIndex}-${setIndex}`,
          workout_id: id,
          exercise_id: exerciseId,
          set_number: setIndex + 1,
          weight_kg: weight,
          bodyweight_kg: 74.5,
          reps,
          hold_seconds: null,
          rpe: 7 + setIndex * 0.5,
          rir: 3 - setIndex,
          tempo: exerciseIndex === 2 ? '3-1-1-0' : null,
          is_warmup: false,
          is_failure: false,
          set_type: 'normal',
          group_id: null,
          notes: null,
          rest_seconds: 150,
          created_at: createdAt,
          updated_at: createdAt,
          deleted_at: null,
        });
      }
    });
  });

  const goals = [
    ['demo-goal-sessions', 'Train four times', 'sessions', 4, 'week', null],
    ['demo-goal-pullups', '30 weighted pull-up reps', 'reps', 30, 'week', exerciseIds[0]],
    ['demo-goal-weight', '+25 kg pull-up', 'top_weight', 99.5, 'month', exerciseIds[0]],
  ].map(([id, label, metric, target, period, exercise_id], display_order) => ({
    id, user_id: DEMO_USER, label, metric, target, period, period_anchor: 'calendar',
    activity_key: metric === 'sessions' ? null : 'strength', exercise_id,
    skill_id: null, custom_tracker_id: null, display_order, is_archived: false,
    created_at: now, updated_at: now, deleted_at: null,
  }));

  const body_metrics = Array.from({ length: 9 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index * 7);
    return {
      id: `demo-body-${index}`,
      user_id: DEMO_USER,
      date: date.toISOString().slice(0, 10),
      weight_kg: Number((74.5 + index * 0.12).toFixed(1)),
      calories_in: null, calories_out: null, protein_g: null, carbs_g: null, fat_g: null,
      body_fat_pct: Number((12.8 + index * 0.08).toFixed(1)),
      steps: 8500 + index * 310,
      notes: null, created_at: now, updated_at: now,
    };
  });

  const programs = [{
    id: 'demo-program-strength', user_id: DEMO_USER, name: 'Anabasis Base',
    description: 'Weighted basics and focused skill practice.', activity_kind: 'strength',
    display_order: 0, target_sessions_per_week: 4, is_archived: false,
    created_at: now, updated_at: now, deleted_at: null,
  }];
  const program_days = [
    { id: 'demo-day-upper', program_id: programs[0].id, name: 'Upper Strength', position: 0, created_at: now, updated_at: now, deleted_at: null },
    { id: 'demo-day-skills', program_id: programs[0].id, name: 'Skills & Legs', position: 1, created_at: now, updated_at: now, deleted_at: null },
  ];
  const program_exercises = exerciseIds.map((exercise_id, index) => ({
    id: `demo-program-exercise-${index}`, program_id: programs[0].id,
    program_day_id: index < 2 ? program_days[0].id : program_days[1].id,
    exercise_id, position: index, target_sets: 3, target_reps: index === 2 ? 8 : 6,
    target_weight_kg: index === 0 ? 20 : index === 1 ? 25 : null,
    target_hold_seconds: null, set_type: 'normal', group_key: null, notes: null,
    created_at: now, updated_at: now, deleted_at: null,
  }));

  return { workouts, sets, goals, body_metrics, programs, program_days, program_exercises };
}

async function seedDemo(page) {
  const rows = demoRows();
  await page.evaluate(async ({ demoUser, rows }) => {
    const request = indexedDB.open('anabasis');
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const storeNames = ['users', 'app_settings', ...Object.keys(rows), 'skills', 'skill_steps', 'user_skill_progress', 'user_skill_step_completions'];
    const missingStores = storeNames.filter((name) => !db.objectStoreNames.contains(name));
    if (missingStores.length) {
      throw new Error(`IndexedDB is not ready; missing stores: ${missingStores.join(', ')} (has: ${[...db.objectStoreNames].join(', ')})`);
    }
    const transaction = db.transaction(storeNames, 'readwrite');
    const put = (store, value) => transaction.objectStore(store).put(value);
    const now = new Date().toISOString();

    put('users', {
      id: demoUser, email: null, display_name: 'Demo', units: 'metric',
      bodyweight_unit: 'kg', language: 'en', schema_version: 16,
      created_at: now, updated_at: now, is_pro: false, pro_expires_at: null,
    });
    // bootstrapDB already created the unique settings row for this profile.
    for (const [store, values] of Object.entries(rows)) {
      for (const value of values) put(store, value);
    }

    const skills = transaction.objectStore('skills');
    const steps = transaction.objectStore('skill_steps');
    const firstSkill = await new Promise((resolve, reject) => {
      const cursor = skills.openCursor();
      cursor.onsuccess = () => resolve(cursor.result?.value ?? null);
      cursor.onerror = () => reject(cursor.error);
    });
    if (firstSkill) {
      const allSteps = await new Promise((resolve, reject) => {
        const requestSteps = steps.getAll();
        requestSteps.onsuccess = () => resolve(requestSteps.result.filter((step) => step.skill_id === firstSkill.id).sort((a, b) => a.step_number - b.step_number));
        requestSteps.onerror = () => reject(requestSteps.error);
      });
      const current = allSteps[Math.min(2, allSteps.length - 1)];
      put('user_skill_progress', {
        id: 'demo-skill-progress', user_id: demoUser, skill_id: firstSkill.id,
        current_step_id: current?.id ?? null, status: 'in_progress', started_at: rows.workouts.at(-1)?.started_at ?? now,
        mastered_at: null, notes: null, created_at: now, updated_at: now,
      });
      allSteps.slice(0, 2).forEach((step, index) => put('user_skill_step_completions', {
        id: `demo-step-completion-${index}`, user_id: demoUser, skill_step_id: step.id,
        achieved_value: step.target_value, added_weight_kg: null,
        achieved_at: rows.workouts[rows.workouts.length - 2 + index]?.started_at ?? now,
        workout_id: null, notes: null, created_at: now,
      }));
    }

    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
    localStorage.setItem('anabasis.activeProfile', demoUser);
    localStorage.setItem('anabasis.onboarded', '1');
    localStorage.setItem('i18nextLng', 'en');
    localStorage.removeItem('anabasis.auth');
  }, { demoUser: DEMO_USER, rows });
}

function makeHero() {
  const inputs = ['dashboard', 'calendar', 'programs', 'exercises'].map((name) => join(OUT, `${name}.png`));
  const result = spawnSync('magick', [
    ...inputs.flatMap((input) => ['(', input, '-resize', '270x584^', '-gravity', 'north', '-crop', '270x584+0+0', '+repage', '-bordercolor', '#27272a', '-border', '2', ')']),
    '+append', '-background', '#09090b', '-gravity', 'center', '-extent', '1200x708',
    join(OUT, 'hero.png'),
  ], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'ImageMagick montage failed');
}

let vite;
let browser;
try {
  mkdirSync(OUT, { recursive: true });
  const port = await freePort();
  if (port === 8120 || port === 8121) throw new Error(`Reserved port selected: ${port}`);
  const baseUrl = `http://127.0.0.1:${port}`;
  vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none' },
  });
  await waitForServer(baseUrl, vite);

  const launchOptions = {};
  try {
    browser = await chromium.launch(launchOptions);
  } catch {
    launchOptions.executablePath = '/usr/bin/brave';
    browser = await chromium.launch(launchOptions);
  }
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    colorScheme: 'dark', locale: 'en-US', timezoneId: 'Europe/Athens',
    serviceWorkers: 'block', reducedMotion: 'reduce',
  });
  await context.route(`${baseUrl}/api/**`, (route) => route.abort('blockedbyclient'));
  await context.addInitScript((demoUser) => {
    localStorage.setItem('anabasis.activeProfile', demoUser);
    localStorage.setItem('anabasis.onboarded', '1');
    localStorage.setItem('i18nextLng', 'en');
    localStorage.removeItem('anabasis.auth');
  }, DEMO_USER);
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`[browser] ${message.text()}`);
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await seedDemo(page);
  await page.reload({ waitUntil: 'networkidle' });

  for (const [path, name] of PAGES) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
    await page.locator('#root').waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
    console.log(`captured ${name}.png`);
  }
  makeHero();
  console.log(`generated ${join(OUT, 'hero.png')} at 1200x708`);
} finally {
  await browser?.close();
  if (vite && vite.exitCode === null) vite.kill('SIGTERM');
  rmSync(TEMP, { recursive: true, force: true });
}
