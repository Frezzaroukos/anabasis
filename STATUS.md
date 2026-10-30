# Anabasis — STATUS

**Μέτωπο 2 · herdr ws «2 · Anabasis»** · Ενημέρωση: 2026-10-30

## Τώρα
- **29–30/10 Daylight + account security + Pro billing (OpenCode):**
  - **Έγινε:** Daylight theme ως default (light/violet, dark preserved, `index.html` status bar default)· migrations `0009_account_security` + `0010_plans` + `0011_billing` εφαρμόστηκαν τοπικά· `POST /api/auth/set_password`, `GET /api/auth/sessions`, `POST /api/auth/sessions/:id/revoke` (public session ids, current-first, no token hashes)· admin plan grant/revoke + `pro_accounts` stats + provider/plan fields· AccountCard plan/session UI + AdminPage controls + i18n EN/EL· Stripe one-time checkout/webhook backend (idempotent `billing_events`, 5-min replay window)· **Stripe live ενεργό**: προϊόν/τιμή `Anabasis Pro` `€7 / 60 days` (one-time EUR), webhook endpoint `https://anabasis.axonos.dev/api/billing/webhook`, live checkout session δημιουργήθηκε+έληξε, signed webhook test σε localhost έδωσε Pro και επανήλθε σε free, `/api/billing/config` → `enabled:true`· repair για cached auth χωρίς `anabasis.activeProfile` (ήταν η αιτία του `wrong_user` sync error) + regression test· tests **15 unit + 75 integration + 519 frontend**, tsc/eslint/`build:staged`/clippy lib+tests PASS· signed-in 10/10 viewport check (account/admin, 375→1440, 0 overflow/alerts)· local API rebuilt/restarted (health 200), sync «up to date», admin Grant/Revoke Pro + extension verified· screenshots `/tmp/opencode/review/account-final-light.png`, `/tmp/opencode/review/account-billing-live.png`, `admin-plan-light.png`, `admin-plan-actions-light.png`· **Deploy 30/10 02:15**: commit `0ab1e94` pushed (prepush PASS), release `20261030-021530-042149290`, live health 200, billing config enabled, live account δείχνει `€7 / 60 days` μετά από SW refresh· icon prompts `~/Desktop/anabasis-icon-prompt.md`.
  - **Μένει:** πραγματική live πληρωμή/refund end-to-end (δεν χρεώθηκε κάρτα)· store readiness (Apple/Google accounts, native wrapper, IAP, Apple Sign In)· landing/OG/icons ακόμη παλιό dark palette· Google login end-to-end.
  - **Θέλει εσένα:** visual review του light account/admin· απόφαση για την τιμή `€7 / 60 days` (αλλάζει εύκολα)· πραγματική δοκιμαστική αγορά/refund αν θέλεις· αν θες καλύτερο icon, στείλε το prompt από το desktop σε Grok/Gemini/Manus. Rollback `npm run deploy:rollback`.
- **28/10 God-level λογαριασμοί + social (OpenCode):**
  - **Έγινε:** `GET /api/social/search` (min 2 chars, μόνο δημόσια/ενεργά, εκτός εαυτού, friendship state) + `POST /api/auth/logout_others`· `PublicProfile` με `account_id`/`friendship` (null στο anonymous)· ProfileCard με edit username/display_name, counters, share/invite· AddFriend με debounced search-as-you-type· Connections tabs Friends/Incoming/Sent με accept/decline/cancel/remove· PublicProfile actions (add/accept/decline/cancel/manage)· AccountCard confirm-password + show/hide + forgot-password magic link + logout-others· i18n EN/EL· tests 517 frontend + 13/70 cargo, tsc/eslint PASS· release build + restart τοπικού API (health 200)· device-check `/community` & `/settings/account` 10/10 (μόνο tiny-text/429 warnings).
  - **Deploy 18:42:** `build:staged && deploy:promote` → `releases/20261028-184249-914292488`· live `/community` 200 + νέο `index-DFja7fmj.js`· `/api/social/search` & `/api/auth/logout_others` 401 χωρίς auth· live device-check `/community` 10/10.
  - **Μένει:** server-authoritative XP/anti-cheat· visual review signed-in profile edit με πραγματικό username.
  - **Θέλει εσένα:** τίποτα· rollback `npm run deploy:rollback` αν δεις πρόβλημα.
- **26/10 Κοινότητα ως κύριος προορισμός (OpenCode):**
  - **Έγινε:** νέα σελίδα `/community` με header + FriendsSection, primary tab «Κοινότητα» (οι Ασκήσεις μετακινήθηκαν στο «Περισσότερα»), CommunityLink στο τέλος του «Η ανάβασή σου»· κάρτα «Η παρέα σου» στην Αρχική (top-3 + CTA, sign-in CTA για επισκέπτες)· invite link με runtime origin (σωστό και μετά από migration domain) + QR sheet (`qrcode.react`, decoded σε `/u/<username>`)· portal σε `document.body` για BottomSheet/ConfirmDialog (σωστό z-index/stacking κάτω από το page transition)· leaderboard podium top-3 + initials avatars + εβδομαδιαίος πίνακας (`period=week`, client-computed rolling 7d `week_xp`, server clamp (0..total) + `week_xp_at` freshness), διόρθωση toggle «Show on global board» (knob έξω από το track) + private hint αντί για invite όταν το προφίλ είναι ιδιωτικό· logged-out invite link `/api/social/public/user/:username` (SQL `share_profile=1`, uniform 404) με CTA «Start your ascent»· i18n EN/EL + nav test· migration `0008_week_xp` εφαρμόστηκε στο τοπικό API (restart, health 200)· 513/513 frontend, 68/68 cargo, tsc/eslint/build PASS, device-check 10/10 + mocked signed-in 10 viewports χωρίς overflow/console errors· screenshots `/tmp/opencode/review/community-*`, `public-profile-mobile.png`.
  - **Μένει:** server-authoritative XP/anti-cheat, visual review της signed-in Κοινότητας με πραγματικό λογαριασμό.
  - **Θέλει εσένα:** visual review της Κοινότητας στο review window 51· «ναι» για deploy.
- **26/10 premium landing + onboarding (OpenCode):**
  - **Έγινε:** νέο `public/landing.html` (Carbon/gold topo, skill ladder, 8 ladders/500+ tests/0 εγγραφές, EN/EL toggle) + premium 4-step onboarding (topo/warm gold accents, rung/altitude panel, step counter, body scroll lock). 508/508 tests, eslint, tsc, production build σε `/tmp/anabasis-verify`, landing + app device-check 10/10 (μόνο tiny-text warnings), 0 overflow/errors· screenshots `/tmp/opencode/premium-shots/anabasis-*v3*`, `anabasis-onboarding-v2-*`.
  - **Μένει:** τελικό visual review από Aggelos· μετά deploy/push με την καθιερωμένη staged ροή.
  - **Θέλει εσένα:** «ναι» για deploy του landing/onboarding· καμία live αλλαγή δεν έγινε.
- **26/10 P2/P3 hardening (OpenCode):**
  - **Έγινε:** OAuth state binding σε HttpOnly/Secure/SameSite=Lax cookie (login CSRF fix), login πάντα Argon2 verify πριν από disabled/locked (state/timing enumeration fix), constant-time admin-code compare, `CF-Connecting-IP` trust μόνο σε loopback ή με ρητό `ANABASIS_TRUST_CF_IP=1`. Tests: 508 frontend + 67 integration + 13 unit, `cargo build --release` PASS, clippy lib/tests PASS.
  - **Deploy 16:07:** commit/push `5b178e9`· DB snapshot `~/.local/share/anabasis-server/snapshots/anabasis-pre-hardening-20261026-1608.db`· `anabasis-api` active (PID 165917, :8121)· live `/api/health` OK· `/api/auth/oauth/google/start` 302 + state cookie· mismatched state/cookie -> 400 `invalid_state`.
  - **Μένει:** full real-browser Google login (account choice/consent).
  - **Θέλει εσένα:** τίποτα· αν θέλεις, κάνε το Google login από browser για end-to-end.
- **23/10 22:20 GitHub, τέλος (Claude):**
  - **Έγινε:** καθαρό ιστορικό στο GitHub (force push `2781e4e` από τον Aggelos, tag `pre-rewrite-20261023`, origin = GitHub). Ο παλιός κωδικός admin δεν ισχύει (έλεγχος στη DB). Το `d61417f` ανέβηκε (prepush-gate PASS) και CI + Pages είναι πράσινα.
  - **Μένει:** τίποτα για το GitHub. Το `prepush-gate` τρέχει πλέον ως `pre-push` hook (τοπικό, όχι στο repo).
  - **Θέλει εσένα:** «ναι» για push αυτού του STATUS commit (μόνο docs).
- **23/10 GitHub, έλεγχος (Claude):**
  - **Έγινε:** report στο `~/code/axonos/docs/system/ANABASIS-GITHUB-2026-10-23.md`. Το GitHub έχει 185/213 commits· τα 28 commits του live κώδικα (12–16/10) είναι μόνο τοπικά (ούτε στο restic). Το `origin` (strength-atlas) είναι νεκρό. Prepush-gate στα 28: PASS· CI τοπικά: vitest 508, cargo 12+64, build: PASS.
  - **Μένει:** Φ0 τοπικό τακτοποίημα (remotes, κλαδιά, `CLAUDE.md` §0/§8/§9), μετά push.
  - **Θέλει εσένα:**
    - Άλλαξε τον κωδικό του λογαριασμού admin πριν από το push (λεπτομέρειες στο report).
    - Διάλεξε **A** (push ως έχει) ή **B** (καθαρό ιστορικό με filter-repo: 735MB→~18MB, χωρίς τους κωδικούς και χωρίς τα 117 AI trailers, force-push· πρόταση).
    - Πες ένα «ναι» για push.
- **16/10 19:11 LIVE 16d3adf** (frontend releases/20261016-191129…): γρηγορότερη πρώτη εμφάνιση — το shell δεν περιμένει το DB bootstrap· LCP / 3201→2552, /calendar 2901→2552, /settings 3057→2552 (5 εναλλάξ μετρήσεις, επιβεβαίωση Grok QA9), διάμεσος score ≥95 · ομάδα: Codex (A9), cross-review Grok (QA9) · rollback: `npm run deploy:rollback` · μένει: σύντομο κενό κείμενο ~200ms στο /history και /calendar πριν τα δεδομένα (προϋπάρχον, HistoryPage.tsx:37)
- **16/10 LIVE c947478** (frontend releases/20261016-025232…, API migrations 0006 gc_floor + 0007 gc_graveyard): export ανά profile, logout με flush + προειδοποίηση για unsynced, πλήρης διαγραφή profile/λογαριασμού (και graveyard — GDPR), import με version/preview, destructive reset χωρίς ghosts, server-side graveyard (καμία ανάσταση ούτε από παλιούς clients), atomic promote/rollback · vitest 507, cargo 12+64, device-check live 80/80 · ομάδα: Claude (A2–A8), cross-review Grok (QA4/QA5) + Codex (QA6–QA8) · rollback frontend: `npm run deploy:rollback` · rollback API (μονόδρομα migrations): stop anabasis-api → επαναφορά `~/.local/state/backups/anabasis-db-20261016-predeploy.db` + `~/.local/state/backups/anabasis-api.prev-20261016` → start · ⏳ git push στο GitHub (public) θέλει «ναι» Aggelos
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
- Deploy: `npm run build:staged && npm run deploy:promote` (rollback: `npm run deploy:rollback`). **ΟΧΙ `npm run build`**: το `dist` είναι symlink στο live release και θα το ξαναγράψει επί τόπου. API: `cargo build --release` + restart anabasis-api (backup DB με sqlite .backup)
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

## Cross-review QA6 — 2026-10-16
- Έγινε: A6 tests/build/device-check πέρασαν· DB-copy repro επιβεβαίωσε guard για cursor client και legacy resurrection χωρίς cursor· αναλυτικά evidence στο night-log DONE QA6.
- Μένει: στρατηγική μετάβασης για παλιούς/offline clients που δεν στέλνουν cursor πριν το API deploy.
- Περιμένει Aggelos: απόφαση για graceful legacy-client migration/retirement· δεν έγιναν code changes, push ή deploy.

## Cross-review QA7 — 2026-10-16
- Έγινε: A7 copied-live-DB repro πέρασε για stale/fresh/legacy payloads· no server resurrection, genuine writes preserved, legacy HTTP/pull pagination finite.
- Μένει: `gc_graveyard` rows επιβιώνουν από delete_account (επιβεβαιώθηκε σε DB copy)· ο legacy client δεν καθαρίζει το τοπικό ghost μέχρι να αναβαθμιστεί.
- Περιμένει Aggelos: απόφαση/διόρθωση πολιτικής retention για graveyard πριν από deploy· δεν έγιναν code changes, push ή deploy.

## Lane A9 — mobile performance · 2026-10-16
- Έγινε: το shell δεν περιμένει το catalog seeding· 5× interleaved Lighthouse, median score ≥95 και LCP candidate ≤ live και στα 7 routes· 508 tests, typecheck/lint/build και device-check 70/70.
- Μένει: μερικές μεμονωμένες Lighthouse εκτελέσεις app routes βαθμολόγησαν 94· route score medians είναι 95, αναλυτικά raw vectors στο `docs/PERF-2026-10-16.md`.
- Περιμένει Aggelos: QA και ρητή έγκριση για μελλοντικό push/deploy· καμία live αλλαγή δεν έγινε.
