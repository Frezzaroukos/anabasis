# Anabasis — STATUS

**Μέτωπο 2 · herdr ws «2 · Anabasis»** · Ενημέρωση: 2026-10-11

## Τώρα
- LIVE https://anabasis.axonos.dev (frontend `dist/` από serve.py :8120, API anabasis-api :8121) · main f25907f (GitHub `github` remote, public)
- Launch P0 έγιναν: Privacy/Terms/Safety + safety ack, landing `/landing.html` EN/EL, SMTP ενεργό (drop-in anabasis-api.service.d/email.conf), quota + tombstone GC
- Πιστοποίηση συσκευών 10 profiles: live 20/20 χωρίς warnings (`device-check https://anabasis.axonos.dev /,/landing.html`) · docs/DEVICE-CERTIFICATION-2026-10-10.md
- Tests: 486 frontend (vitest) + server cargo · audit: docs/LAUNCH-READINESS-2026-10-09.md

## Επόμενα 3
1. Landing ως αρχική για νέους επισκέπτες (σήμερα η αρχική είναι η app) — απόφαση Aggelos
2. Πρώτοι χρήστες: posts έτοιμα στο audit §3.6 (r/bodyweightfitness κλπ) — αποστολή μόνο από Aggelos
3. Always-on hosting (σήμερα: το PC με linger) — fly.io δωρεάν ή VPS ~4€ — απόφαση Aggelos

## Περιμένουν Aggelos
- Οι αποφάσεις 1 και 3 παραπάνω

## Κανόνες
- Deploy: `npm run build` (γράφει στο live dist/· ξαναχτίζεται από το git) · API: `cargo build --release` + restart anabasis-api (backup DB με sqlite .backup)
- Public repo: commit messages χωρίς AI trailers · ποτέ fake χρήστες/μετρικές

## Lane A5 — Grok round-2 fixes 2026-10-15 (branch pro-2026-10, UNPUSHED)
- Έγινε (4 commits d23d9ce→d6d2fcf, πάνω στο 70db0b3): (1) sync gc_floor reset ΟΝΤΩΣ destructive — σβήνει τοπικά ghosts που λείπουν από το ζωντανό snapshot & σπρώχνει μόνο γνήσια νέα/νεότερα μη-tombstoned (όχι ανάσταση)· (2) deleteProfile από ΜΙΑ πηγή (USER_DATA_TABLES) + οι 3 που έλειπαν (program_days/custom_trackers/custom_tracker_entries), logout κάνει flush unsynced πριν το purge + προειδοποίηση/«ούτως ή άλλως» αν offline· (3) promote/rollback zero-downtime με atomic symlink swap (`mv -T`), sandbox-verified + serve.py follows live· (4) API-CONTRACT/σχόλια LWW: last-WRITE-wins + bounded forward-skew clamp (όχι last-push, όχι πλήρες HLC).
- Verify: vitest 506/506, cargo 62/62, tsc -b + eslint clean, build:staged ok, device-check 10 profiles × 3 routes (/, /settings/account, /landing.html) = 30/30 (0 overflow, 0 console errors, 390→1440). ΟΧΙ deploy/push/restart.
- Περιμένει Aggelos: QA + ρητό «ναι». Ενεργοποίηση (μετά το «ναι»): push `git -C ~/code/anabasis push github pro-2026-10`· deploy staged→live `npm run build:staged && npm run deploy:promote` (1η φορά κάνει legacy-migration του dist/ σε symlink). Σημ.: ο νέος deploy ΔΕΝ είναι πια `npm run build` (έγραφε κατευθείαν live).

## Lane A4 — Codex blockers κλεισμένα 2026-10-15 (branch pro-2026-10, UNPUSHED)
- Έγινε: uncommitted perf (gzip origin + app-shell) committed· (1) export μόνο τρέχοντος profile + ειλικρινές UI, (2) logout/deleteAccount σβήνουν τα τοπικά δεδομένα του λογαριασμού, (3) import version-gate + LWW no-clobber + preview, (4) sync gc_floor reset-guard + clock-skew clamp (cargo+vitest), (5) staged build (`build:staged` + promote/rollback, docs/STAGED-BUILD.md).
- Verify: vitest 501/501, cargo 74/74, tsc+eslint clean, `build:staged` ok, device-check 10 profiles × 8 routes = 80/80 (0 overflow, 0 console errors). 7 commits 1ae87bd→0881245.
- Περιμένει Aggelos: QA + ρητό «ναι» για push/deploy (ΟΧΙ έγινε)· Notion Warrior import εκκρεμεί (θέλει απαντήσεις)· 4b clamp είναι bounded skew-guard, όχι πλήρες HLC (προς επιβεβαίωση αν θέλουμε full).

## Έλεγχος ολοκλήρωσης — Codex 13/10/2026
- Έγινε: read-only audit pro-2026-10@3f25e2a· frontend suite PASS σε73files, backend72tests και lint PASS· παραδοτέο anabasis-readiness-2026-10-13.md στα outputs του τρέχοντος Codex chat.
- Μένει: release artifact/staged build, backup all-profile scope/import policy, old-offline-client GC/clock-skew sync και Tauri API portability· τελικό build/typecheck/10-device+real-device/login/restore QA δεν έγινε τώρα.
- Περιμένει Aggelos: scope v1 web/PWA και μεταγενέστερη έγκριση δημοσίευσης· σημερινές index.html/serve.py uncommitted αλλαγές διατηρήθηκαν, κανένα repo code/deploy/push/restart.
