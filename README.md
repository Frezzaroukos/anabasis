<div align="center">

<img src="public/logo.svg" width="88" alt="Anabasis">

# Anabasis · Ἀνάβασις

**Weighted-calisthenics & skill-progression tracker.**
Offline-first PWA · native desktop · optional accounts & sync · TypeScript strict · bilingual (EN/EL)

![tests](https://img.shields.io/badge/tests-302%20passing-brightgreen)
![typescript](https://img.shields.io/badge/TypeScript-strict-blue)
![backend](https://img.shields.io/badge/backend-Rust%2FAxum-orange)
![license](https://img.shields.io/badge/license-MIT-lightgrey)

**[▶ Live demo](https://anabasis.axonos.dev)** · works offline, no signup required — an account is optional, only to sync across devices

<img src="docs/screenshots/hero.png" alt="Dashboard, goals, workout and calendar screens" width="100%">

</div>

---

> *Anabasis* — «η ανάβαση». Κάθε skill είναι μια σκάλα: tuck → advanced tuck →
> straddle → full. Η εφαρμογή υπάρχει για να δείχνει σε ποιο σκαλί είσαι και
> ποιο είναι το επόμενο.

## Why it exists

Generic gym apps treat **skills** as an afterthought. If you train front lever,
planche or muscle-up you are not logging "sets × reps" — you are moving through
a **chain of prerequisites**, measured in hold-times and technical milestones.

Anabasis is built for athletes doing **both**: weighted basics (pull-ups, dips,
pistol squats) **and** skill progressions.

## What it does

| | |
|---|---|
| **Skill ladders** | 8 skills, 4–6 steps each. Locked steps stay **visible** — you see the road, not just your rung. The active ladder leads the home screen. |
| **Calendar-centric** | The calendar is the home of logging: pick a program day (*upper*, *legs & core*, …) or start an ad-hoc session on any date. Set-by-set logging with buttons — separate bodyweight + added weight, RPE/RIR/tempo, warm-up and failure flags, quick-log parsing (`80 5,4,3,2`). |
| **Goals in your own terms** | A goal is four independent axes — *what you count × how much × over what window × for which activity or exercise*. "4 sessions a week", "20 km a month" and "100 pull-up sets a month" are the same feature, not three. Wired to programs, exercises and live progress. |
| **PR tracking** | 8 PR types across strength and non-set activities (distance, duration, pace). Warm-ups excluded. e1RM via Epley/Brzycki. |
| **Sync when you want it** | Local-first by default. Create an account and your training follows you to any device and to the desktop app — row-level last-write-wins sync over a Rust backend. Full JSON export/import stays; nothing is locked in. |
| **Customisable home** | Hide and reorder every card. A hidden card never mounts and never queries. |

## Engineering notes

The parts worth reading, and why they are the way they are.

**Local-first, then sync — no lie in between.** Everything lives in IndexedDB
(Dexie) and the app is fully usable with no account. Every write stamps
`updated_at` and deletes are soft (`deleted_at`), which is exactly what the
optional sync layer needs: row-level last-write-wins against a Rust/Axum +
SQLite backend, with a per-account monotonic `seq` cursor and a DB `epoch` that
protects against restore-desync. Auth is argon2id + opaque bearer tokens in a
session table (not JWTs — revocation matters; not cookies — the Tauri
production-cookie trap).

**Schema migrations, v1 → v13.** Each version ships its own `.upgrade()` with
backfills; all additive, no data loss. v9 backfilled existing goals to *rolling*
windows because that is how they were already counting — migrating them to
*calendar* would have silently changed the meaning of a goal already set. v12–13
grew the calendar-centric structure: program days, workout↔program links, and a
weight dimension on skill steps (skills and exercises are now one library).

**Components never touch `db.*`.** All access goes through `lib/db/queries.ts`
and `lib/db/goals.ts`. `lib/domain/` is pure functions (e1rm, pr, volume) with
no DB or UI dependency, which is why they are the easiest things to test.

**No invented data.** Cards return `null` rather than render zeros; a stat with
no measurement behind it is misleading, not neutral. No default goals are
seeded — a goal the user did not set is not a goal.

**Testing where it pays.** 302 tests concentrated on migrations, the goal
window calculator (pure, with an injectable clock, so "the week starts on
Monday" does not depend on the day CI runs), PR detection, the card-order
resolver, and the sync engine (push/pull cursors, epoch handling, last-write-wins
merges) — each case matching a change that will actually happen
(a card added, a card removed, corrupted preferences, a restore mid-sync).

```
src/
├── app/          routes + AppShell (calendar-centric nav)
├── features/     one folder per surface; dashboard cards are independent
│                 components that query for themselves
├── components/   shared primitives (Logo, Card, ProgressRing, ActivityChip)
├── lib/
│   ├── db/       Dexie schema, migrations, typed queries, seeds
│   ├── sync/     push/pull engine, cursors, epoch, last-write-wins  ← tested
│   ├── api/      auth store + typed client (opaque bearer tokens)
│   └── domain/   pure logic: e1rm · pr · volume  ← unit-tested
└── i18n/         en.json · el.json

server/           Rust · Axum · SQLite (sqlx) — accounts, sync, admin, OAuth scaffold
src-tauri/        Tauri 2 desktop shell (WebKit; PWA layer off in-app)
```

## Stack

**Frontend** — Vite 5 · React 18 · **TypeScript (strict)** · Tailwind 3 ·
**Dexie 4** (IndexedDB) · React Router 6 · Recharts · vite-plugin-pwa + Workbox ·
i18next · Vitest
**Backend** — **Rust · Axum 0.8 · SQLite (sqlx)** · argon2id · tower_governor rate limiting
**Desktop** — **Tauri 2** (same frontend, ~13MB native binary)

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 302 tests
npm run build    # production + service worker
```

Or as a native desktop app (Tauri 2 — same frontend, no browser, ~13MB binary):

```bash
npm run tauri build -- --no-bundle   # needs Rust + webkit2gtk
./scripts/install-desktop.sh         # installs binary + .desktop entry (Linux)
```

Optional sync backend (accounts stay optional — the app is fully usable without it):

```bash
cd server && cargo run --release     # Axum + SQLite on :8121
```

Screenshots in this README are generated, not hand-taken:

```bash
node scripts/shots.mjs        # headless Chromium, 390×844
node scripts/gen-brand-assets.mjs   # favicon/PWA/OG from one source of truth
```

## Status

Working: calendar-centric logging, skill ladders (merged into one exercise
library), goals wired to programs/exercises/progress, PR tracking, body metrics,
programs with days, progress charts, export/import, i18n, PWA, multiple local
profiles.

Also working: native desktop app via Tauri 2 (`src-tauri/`) — the same frontend
in a WebKit window, PWA layer off; and the **Rust/Axum backend** (`server/`) —
accounts (argon2id), a unique admin, row-level cross-device sync, rate limiting,
restic-backed DB snapshots.

In progress: Google OAuth (server scaffold in place), friends & leaderboards,
mobile native builds.

---

Built by [Aggelos Frezzaroukos](https://github.com/Frezzaroukos) · MIT
