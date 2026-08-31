# Anabasis — State Mindmap (2026-08-31)

Πλήρης εικόνα: πού είμαστε ΤΩΡΑ vs ιδανική κατάσταση.

## ΤΩΡΙΝΗ ΚΑΤΑΣΤΑΣΗ (analytic)

```
Anabasis  (~/code/anabasis · github.com/Frezzaroukos/anabasis · renamed from strength-atlas)
│
├── FRONTEND  [Vite5 · React18 · TS strict · Tailwind3 · Dexie4/IndexedDB · Recharts · i18next EN/EL · PWA]
│   ├── Architecture v4 = Calendar-centric ......................... ✅ LANDED
│   │   ├── Workout tab removed → Calendar = center ................ ✅
│   │   ├── PRIMARY_NAV = [Home, Calendar, Programs, Exercises] .... ✅
│   │   ├── Program days (upper/legs/…) + ad-hoc random workout .... ✅
│   │   ├── Set-by-set logging me koumpia (όχι live stopwatch) ..... ✅
│   │   ├── Skills ↔ Exercises merged (+weight dimension, schema13). ✅
│   │   └── Goals wired → programs/progress/exercises .............. ✅
│   ├── Design = Carbon theme + L5 Summit-seal logo ............... ✅
│   │   ├── graphite grounds · mono type · GOLD only for records ... ✅
│   │   ├── fonts: Fira Sans Cond / Manrope / JetBrains Mono ....... ✅
│   │   ├── F6 altitude gamification · M3 theatrical motion ........ ✅
│   │   └── Vercel/Linear-grade polish pass (670fb0f) .............. ✅
│   ├── Tests: 307 vitest passing · tsc clean .................... ✅
│   └── Nutrition/calories DROPPED (thermidor handles food) ....... ✅ (manual steps only)
│
├── BACKEND  [Rust · Axum0.8 · SQLite/sqlx0.9 · :8121]
│   ├── Accounts: argon2id · opaque bearer tokens (session tbl) .... ✅
│   ├── Admin: claim_admin via ANABASIS_ADMIN_CODE=7431agg ......... ✅
│   ├── OAuth Google: scaffold ................................... ⚠️ scaffold only
│   ├── Sync: row-level last-write-wins · per-acct seq · epoch ..... ✅ VERIFIED
│   ├── Rate limit: tower_governor keyed CF-Connecting-IP ......... ✅
│   └── Backups: restic VACUUM INTO + restore rotates epoch ....... ✅
│
├── DESKTOP  [Tauri2 · WebKitGTK · ~/.local/bin/anabasis]
│   ├── Root cause stale-build (strength-atlas path cache) FIXED ... ✅
│   ├── Fresh v4 binary rebuilt (2026-08-30 22:27) ................ ✅
│   └── Login + pull data ........................................ ⏳ PENDING (input-automation unsafe)
│
├── WEB  [serve.py · systemd user 'anabasis' :8120 · CF tunnel anabasis.axonos.dev]
│   ├── Service active · /api→:8121 before static rule ........... ✅
│   └── Login verified → 57 workouts pull, no console errors ...... ✅
│
├── DATA  [server DB · ~/.local/share/anabasis-server/anabasis.db]
│   ├── admin aggelosf2016@gmail.com · role=admin ................. ✅
│   └── sync_rows: sets 3208 · workouts 57 · exercises 26 ......... ✅ (Notion import LIVE on server)
│
└── OUTWARD  [W-E: user said "yes / παιξε καλή μπάλα"]
    ├── Repo structure cleanup ................................... ⏳ PENDING
    ├── Portfolio Anabasis description update .................... ⏳ PENDING
    └── Final git push ........................................... ⏳ PENDING
```

## ΙΔΑΝΙΚΗ ΚΑΤΑΣΤΑΣΗ (target)

```
Anabasis = personal-tool + portfolio-piece + public-product, top-level quality
│
├── PARITY: web == desktop == data, πάντα (καμία απόκλιση, ένα build source)
├── DESKTOP: ανοίγεις → ήδη logged-in admin → 57 workouts στο calendar, χωρίς setup
├── PORTFOLIO: portfolio.axonos.dev δείχνει Anabasis σωστά (screenshots v4, live demo link,
│              stack, "real data 57 workouts", GitHub link) — job-anchor για Omilia
├── REPO: καθαρή δομή (docs/ SSOT, no dead files, README που εξηγεί architecture+run),
│         Claude-Session trailers stripped, public-safe (no secrets)
├── PUBLIC DEMO: anabasis.axonos.dev + GitHub Pages 24/7, onboarding smooth
├── OAUTH: Google login πραγματικά functional (όχι scaffold)
├── QUALITY BAR: Hevy/Whoop-level UX · animations · empty states · a11y · mobile-touch native
└── EVOLUTION: goals-driven (/goal), self-improving, kάθε pass = ποιοτική αναβάθμιση
```

## GAP = τι μένει για ιδανικό
1. Desktop login + data (safe path: inject session token σε WebKit storage ή one-time login)
2. W-E: repo cleanup + portfolio update + push
3. OAuth Google: scaffold → functional (later)
4. Visual check full (calendar Sept'25–Feb'26 + exercise progress chart)
