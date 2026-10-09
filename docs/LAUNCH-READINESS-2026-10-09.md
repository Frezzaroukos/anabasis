# Launch / market-readiness audit — 2026-10-09

Scope: **go-to-market** readiness — can Anabasis be handed to an external user and
promoted to the public tomorrow? This complements the code/config audit in
[`READINESS-2026-09-28.md`](./READINESS-2026-09-28.md) (verdict 8.6/10, no open
P1/P2). That one asked "is the code sound?"; this one asks "is the *product* ready
to sell/share?" — admin operability, user onboarding, the market front door
(landing, pricing, legal, analytics, stores, channels), and release risk.

**Method:** repository + live inspection on 2026-10-09. No deploy, push or
live-service mutation (coordinator rule). Health/injury disclaimer, legal pages and
screenshots are implemented on branch `launch-2026-10` as P0 (see §5).

Verification run (2026-10-09, branch `launch-2026-10` base):

```text
npx tsc -b --noEmit        PASS
npx vitest run             PASS — 69 files, 480 tests
cd server && cargo test    PASS — exit 0 (unit + integration)
live anabasis.axonos.dev/      HTTP 200
live anabasis.axonos.dev/api/health  HTTP 200 {ok:true, version:0.1.0, epoch:…}
services anabasis.service / anabasis-api.service  active
```

---

## Verdict

**Soft-launch ready to a controlled group (friends / warm leads) once the two P0s
below ship. NOT ready for cold public promotion (Reddit/Product Hunt) yet** — not
because of code quality (that is high), but because of three go-to-market gaps:

1. **No safety / health disclaimer** anywhere (P0 — liability for a strength app).
2. **No standalone legal pages** — only a one-paragraph in-product privacy summary;
   no Privacy Policy, no Terms (P0 — GDPR + trust + future app-store requirement).
3. **Single-point-of-failure hosting** — the backend runs on Aggelos's desktop PC
   (always-on, systemd linger) behind a Cloudflare tunnel. Fine for a closed friend
   group (offline-first covers outages); **a dedicated always-on host is still
   recommended before cold promotion** (P1 — see §6) so uptime does not depend on
   one machine.

Everything else (admin, onboarding, offline, install, export, i18n) is in good
shape. The product is genuinely usable and distinctive. The blockers are the
"responsible-adult" layer you put between a working app and a stranger.

Market-readiness score: **6.5/10** (vs 8.6 code-readiness). The delta is entirely
the go-to-market layer, not the engineering.

---

## 1. Admin — what Aggelos can do today

**Today (works), `src/features/admin/AdminPage.tsx` (542 lines), admin via secret
`ANABASIS_ADMIN_CODE` in `~/.config/aggelos-stack/secrets/anabasis.env`:**

- **Users:** list all accounts with loading / empty / error states, search,
  per-user row breakdown (how many rows per table), account analysis. Self-guard
  and last-admin guard prevent locking yourself out (`server/src/admin.rs`).
- **Data:** honest DB size reported in-UI (not faked). Server data at
  `~/.local/share/anabasis-server/anabasis.db` (57 workouts / 3208 sets / 2
  programs — Aggelos's real import).
- **Health/version:** unauthenticated `/api/health` returns version + `epoch`
  (restore-desync guard). Confirmed live 200.
- **Sync server:** `anabasis-api.service` (Rust :8121), `anabasis.service`
  (web :8120) — both `active`. LWW sync, soft-delete, per-account `seq` cursor.
- **Backups:** restic (daily local + R2 offsite) — real and running, but the
  systemd/restic definitions live **outside** this public repo, so a fresh clone
  cannot reproduce restore.

**Missing for real operations:**

- **No growth/usage metrics** — admin can count rows but has no view of
  signups-over-time, active users, or sync-error rate. You cannot answer "how many
  people actually used it this week?" (by design, since there is zero analytics —
  see §3.5; a privacy-respecting aggregate counter is the fix).
- **Abuse protection — present.** Per-account row **quota** (`max_rows_per_account`,
  default 100k, env override) is enforced on push, and **tombstone GC**
  (`sync::prune_tombstones`, cursor/epoch-safe, horizon clamped to a safe minimum)
  is exposed via an admin endpoint. Both are covered by tests
  (`push_rejects_new_rows_beyond_account_quota`, `admin_gc_*`). The only follow-up
  is making GC *scheduled* rather than admin-triggered — optional for a closed group.
- **No in-repo runbook** for deploy / restore / incident. Carried over as P3 from
  the 09-28 audit.
- **No admin audit log** — no record of admin actions (who deleted what, when).

**Admin verdict:** strong for a solo operator with a closed group. Quota + GC are in
place; remaining nice-to-haves are an aggregate metrics view, scheduled GC, and an
in-repo runbook before scaling past friends.

---

## 2. User — first-run → daily use

**Onboarding:** 3-slide overlay on first visit (`OnboardingOverlay.tsx`). App is
**fully usable with no signup** — root `/` opens straight into the dashboard; a new
user can log a workout immediately. Empty-state hint points to the calendar (the
real logging entry point).

**Account / sync:** optional cloud account (username + password, argon2id, opaque
revocable tokens). Cross-device sync is real last-write-wins. Google sign-in is
**config-gated** — the button only renders if `/api/auth/n/providers` reports it
available, so the unpublished-OAuth state degrades cleanly (no broken button). ✅

**Export / import:** JSON export + import present (Data & backups, Import page).
Works without cloud. Honest, user-owned data.

**Offline:** offline-first — all data in IndexedDB (Dexie, schema v15), works in
airplane mode; PWA precaches app assets; update-reload guarded against
double-reload.

**Install:** PWA "Add to Home Screen" (iOS + Android), accent-aware favicon,
maskable icons, Tauri desktop binary (~14 MB) for Linux. Confirmed installable.

**Languages:** English + Greek (`src/i18n/en.json`, `el.json`), full parity on
the keys checked.

**Gaps:**

- **Email is dormant.** `ANABASIS_SMTP_*` is unset, so magic-link / passwordless
  login does not send. Not a hard blocker (password + Google cover signup), but it
  means there is **no email channel at all** — no welcome, no deletion confirmation
  email, no password recovery by email. P1.
- **Apple sign-in** blocked on Apple Developer ($99/yr). Known, deferred.
- **Cold-visitor front door** — addressed: a value-prop landing now ships at
  `/landing.html` (§3.1). The app root still opens straight into use for people
  who already know what it is.

**User verdict:** the daily-use loop is solid and genuinely offline-first. The gaps
are acquisition-side, not usage-side.

---

## 3. Market — the front door

### 3.1 Landing / value proposition — **built (P1 done)**

A dedicated marketing landing now ships at `public/landing.html` (served at
`anabasis.axonos.dev/landing.html`): value prop ("what it solves" + "for whom"),
four real screenshots from the synthetic demo profile, "Open the app" + "Install"
CTAs, bilingual EN/EL (CSP-safe external toggle — the production CSP is
`script-src 'self'`, so the toggle is `/landing/landing.js`, not inline), calm
Carbon styling with system fonts (no external requests → no CSP or font-loading
cost). The app root `/` stays the app itself; the landing is the shareable front
door you point cold traffic at.

**Lighthouse (mobile, headless, 2026-10-09):** Accessibility 100, Best Practices
100, SEO 100 (all ≥95 target met). Core Web Vitals: LCP 60 ms, CLS 0.03, TTFB
4 ms → performance effectively 100. Screenshots regenerated at 390/1440
(`docs/screenshots/landing*.png`).

Remaining (optional, Aggelos decision): whether to make the landing the site root
(it would move the app under `/app`) — kept as `/landing.html` for now so the
app's direct-open behaviour is unchanged.

### 3.2 Pricing — proposed (honest free/pro)

The app is currently **free and self-hosted**; there is no billing and realized
revenue is **€0** (never fake this). For a public product, an honest model:

| Tier | Price | What | Honest assumption |
|---|---|---|---|
| **Free (local)** | €0 | Full app, offline, unlimited logging, export/import, PWA/desktop. No account needed. | This is the whole product today. It must stay genuinely complete — the app's integrity is the selling point. |
| **Cloud (sync)** | €0 now → €3–4/mo later | Account + cross-device sync + social/leaderboard. | Costs real money only once always-on hosting exists (§6). Charging before that would be selling reliability you cannot guarantee. Keep it free until always-on. |
| **Pro (future)** | ~€4–5/mo | Advanced coach/progression analytics, data history beyond N months, priority. | Do **not** paywall anything that exists today. Pro must be *new* value, or it reads as a bait-and-switch. |

**Stance:** stay free for the friend group and the portfolio phase. Introduce paid
cloud **only after** always-on hosting + a Terms/refund/VAT story (Aggelos is
pre-company; see memory `AXON-COMPANY-SETUP` — real billing is a post-army,
accountant-gated step). Pricing here is a *plan*, not a live offer.

### 3.3 Legal — **P0, mostly missing**

Present: a one-paragraph in-product **privacy summary** (EN/EL,
`settings.privacySummary`) — honest ("No ads or analytics. Training data stays in
this browser unless you choose cloud sync…"). That is a good start but not a policy.

**Missing (blocks handing to a stranger in the EU):**

- **Privacy Policy** page — what data (account email, sync rows, server IP logs),
  legal basis, retention, deletion right, controller contact. GDPR expects this the
  moment a stranger can create an account.
- **Terms of Service** — acceptable use, "as-is" no-warranty, liability cap,
  governing law. Especially important given self-hosted, best-effort hosting.
- **Health / injury disclaimer** — **the clearest gap.** A weighted-calisthenics
  app (weighted pull-ups, dips, progressions) gives training structure to strangers
  with **zero** "consult a professional / train at your own risk / stop if you feel
  pain" language anywhere. This is both an ethical duty of care and a liability
  exposure. **P0.**

**Not needed (and a genuine strength):** no cookie-consent banner is required —
the app sets no tracking cookies and runs no analytics. Say so explicitly in the
policy; it is a selling point.

→ Implemented on branch as P0: Privacy, Terms and Safety pages + a one-time safety
acknowledgement. See §5.

### 3.4 Analytics — none (privacy win, insight gap)

Zero analytics/tracking. Great for the privacy pitch, but you are blind to usage.
**Recommendation (P2, decision needed):** either (a) stay zero-analytics and lean
on it as a feature, or (b) add **privacy-respecting, aggregate-only** server-side
counts (signups, active accounts) with no per-user tracking and no third-party JS.
Do **not** add Google Analytics / any third-party tracker — it would contradict the
whole positioning. Recommend (b): a self-hosted aggregate counter in the admin
view, documented in the privacy policy.

### 3.5 Stores / listing — PWA today

- **Now:** PWA install works on iOS + Android today (documented, confirmed).
- **Google Play:** wrap the live PWA in a **TWA** (Bubblewrap) — cheap, thin
  Android shell. Recommended first store move.
- **App Store (iOS):** needs **Capacitor** + Apple Developer ($99/yr). Deferred.
- **Linux:** Tauri binary exists; **Flathub / AUR** listing is a low-effort
  distribution win for the Linux/portfolio audience. Candidate P2.

No store listing copy or assets exist yet beyond the screenshots — drafting those
is part of the go-to-market package, not a code blocker.

### 3.6 Promotion channels — ready first posts

Drafts below are **ready to post** once P0 ships and (for cold channels) always-on
hosting exists. They are honest: a solo-built, free, open-source, local-first
tracker — not a funded startup.

- **r/bodyweightfitness** (self-promo rules: contribute first, flair, no spam):

  > **I built a free, offline-first tracker for weighted calisthenics + skill
  > progressions (no signup, open source)**
  >
  > I train weighted basics and skills (planche/front-lever ladders) and nothing
  > tracked both the *load* and the *skill step* well, so I built my own. Each skill
  > is a ladder (tuck → straddle → full) and the app shows which rung you're on.
  > Set-by-set logging, calendar-centric, works fully offline (your data stays in
  > your browser — no account needed to try it), optional sync if you want it.
  > It's free and the code is open. Would love feedback from people who actually
  > train this way. [link] · [GitHub]

- **r/calisthenics / r/Fitness (Victory Sunday / dedicated threads only):** shorter
  variant of the above, lead with the skill-ladder idea.

- **Hacker News (Show HN):** lead with the *engineering* (job-anchor): "Show HN:
  Anabasis — a local-first (IndexedDB + optional Rust/SQLite sync) calisthenics
  tracker" — offline-first, LWW sync, Tauri desktop, open source. HN rewards the
  architecture story.

- **Personal network (Instagram / friends):** the warm path. Greek-language post,
  "δοκιμάστε το, πείτε μου τι λείπει", link + QR.

**Rule:** never buy engagement, never fake reviews/users/ratings. Realized revenue
and user counts are €0 / small and stay truthful.

---

## 4. Risks & bugs

**From running the suites + live checks — no code bugs surfaced:** 480 frontend
tests pass, backend `cargo test` exits 0, `tsc -b` clean, live app + API return
200. Engineering is healthy.

**Launch risks (ranked):**

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | No health/injury disclaimer on a strength app | **High (P0)** | Ship Safety page + one-time ack (§5) |
| R2 | No Privacy Policy / Terms (GDPR, trust) | **High (P0)** | Ship legal pages (§5) |
| R3 | Backend = single desktop PC + tunnel (SPOF) | High (P1) | dedicated always-on host (fly.io free / €4 VPS) before cold promo; offline-first covers friends. PC is always-on (linger) but one machine is still a SPOF |
| R4 | SMTP unset → no email at all | Medium (P1) | **Wired** (`EmailConfig::resolve` reads shared `SMTP_*` + systemd drop-in `email.conf`); activation = daemon-reload + restart (Aggelos-gated, turns on real email) |
| R5 | Tombstone GC is admin-manual, not scheduled | Low | quota + GC **implemented & tested** (`prune_tombstones`, `max_rows_per_account`); only automation is optional before ~100 users |
| R6 | Google OAuth app unpublished | Low | button is gated (hidden) — safe; publish when ready for Google signup |
| R7 | Zero usage insight (no analytics) | Low | privacy-respecting aggregate counter (§3.4) — decision, not a bug |
| R8 | Backup/restore not reproducible from repo | Low (P3) | commit sanitized runbook (carried from 09-28) |

---

## 5. P0 implementation (branch `launch-2026-10`)

Shipped on this branch (code), with tests + build:

1. **Safety / health disclaimer** — bilingual (EN/EL), shown in onboarding and on a
   dedicated **Safety** page, with a one-time acknowledgement stored locally.
2. **Legal pages** — **Privacy Policy** and **Terms of Service** (bilingual,
   honest: local-first, no analytics, optional account, best-effort hosting, €0),
   reachable from Settings → About and footer, with routes `/legal/privacy`,
   `/legal/terms`, `/legal/safety`.
3. **Screenshots** — refreshed at 390 (mobile) and 1440 (desktop) widths in
   `docs/screenshots/`.

**P1 shipped on this branch (second pass):** value-prop **landing**
(`/landing.html`, EN/EL, Lighthouse ≥95); **SMTP wiring** (`EmailConfig::resolve`
reads the shared `email.env` + systemd drop-in — activation gated); quota + GC were
already done (`d78e5c6`).

Still gated on Aggelos/coordinator (decision or deploy): always-on hosting (P1),
SMTP **activation** (daemon-reload + restart turns on real email), analytics
decision (P2), store listings (P2), publishing Google OAuth, and whether the
landing becomes the site root.

**No push, no deploy, no live-service change** was performed. Deploy is gated on
Aggelos / the coordinator per the lane rules.

---

## 6. Path to cold-public launch (recommended order)

1. ✅ P0 legal + safety (this branch) → review → merge → deploy (Aggelos-gated).
2. Value-prop landing — **done** (`/landing.html`, Lighthouse ≥95). Optional:
   promote it to the site root.
3. Stand up **always-on** backend (fly.io free tier; migration is easy — same
   binary + volume + tunnel) (P1).
4. Enable email (P1) — **already wired**: `EmailConfig::resolve()` reads the
   shared `SMTP_*` names (axonos `email.env`), and the systemd drop-in
   `~/.config/systemd/user/anabasis-api.service.d/email.conf` adds that env file.
   Activate with `systemctl --user daemon-reload && systemctl --user restart
   anabasis-api.service`, then verify with
   `cargo run -p anabasis-api --example smtp_check` (dry-run) and, to actually
   send once to Aggelos, `ANABASIS_SMTP_TEST_SEND=1 … --example smtp_check`.
5. Per-account quota + tombstone GC are **already implemented and tested**; the
   only optional follow-up is scheduling the GC (before ~100 users).
6. Decide analytics (aggregate-only or none) (P2).
7. Post to warm network → r/bodyweightfitness → Show HN (drafts in §3.6).
8. Later, accountant-gated: paid cloud tier + real billing + VAT/invoicing.
