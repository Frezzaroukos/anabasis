# Anabasis — Launch checklist 2026-11-03

**Live:** https://anabasis.axonos.dev · release `20261103-231428-334456351`  
**Code:** `163e6c2` (landing, command palette, reports, pricing) · CI/Pages: green  
**Native:** Tauri binary installed, `.deb` built.

## P0 — Payments (decision/research, όχι live ακόμα)

- [x] Έρευνα Stripe vs Shopify vs MoR: `~/code/axonos/docs/research/PAYMENTS-2026-11-03.md`
- [x] Σύσταση: **Paddle** πρώτο, **Polar** fallback, **Lemon Squeezy** εύκολο fallback.
- [x] Γιατί όχι Shopify: digital-only order ⇒ εμείς MoR/VAT, €19–27/μήνα, όχι native app checkout.
- [ ] KYC/IBAN/ΑΦΜ από Aggelos.
- [ ] Paddle sandbox + domain verification + products:
  - `pro-monthly` €10.99/month
  - `founding-lifetime` €49.99 one-time / 250 cap
  - `standard-lifetime` €99.99 one-time
- [ ] Backend provider abstraction + webhook idempotency.
- [ ] Sandbox: subscription, lifetime, cancel-at-period-end, refund, portal, duplicate webhook.
- [ ] Production smoke: 1 πραγματική αγορά + refund.
- [ ] Μην αφαιρέσουμε Stripe code μέχρι να περάσει το smoke.

## P1 — Profile hardening (ολοκληρώθηκε το core)

- [x] Τα data URLs δεν φεύγουν πλέον από το API· `avatar_url` = opaque `/api/social/avatar/<token>`.
- [x] Migration `0014_avatar_token` (unique token, backfill existing).
- [x] `GET /api/social/avatar/<token>`: webp/jpeg/png only, `nosniff`, CSP sandbox, 1h cache.
- [x] Token αλλάζει σε upload/remove· παλιό URL 404 (verified live).
- [x] Avatar εμφανίζεται σε friends/leaderboard/search/public profile μέσω resolver (web + Tauri API origin).
- [x] 320/390/1440 overflow audit: 0 horizontal overflow μετά το fix στα Programs buttons.
- [ ] Automated image moderation/report flow — **δεν υπάρχει**· μόνο policy + manual report/email.
- [ ] Avatar από Settings/Home header (discoverability) — προαιρετικό.
- [ ] Rate-limit/abuse monitoring για avatar endpoint.

## P2 — Native app

- [x] Tauri release build (`dist-tauri`).
- [x] `.deb`: `src-tauri/target/release/bundle/deb/Anabasis_0.1.0_amd64.deb` (5.5MB).
- [x] Installed: `~/.local/bin/anabasis` + `anabasis.desktop`; window verified.
- [x] AppImage built with `NO_STRIP=1` (`Anabasis_0.1.0_amd64.AppImage`, 103MB).
- [x] AUR source-build scaffold (`packaging/PKGBUILD`, not published).
- [ ] Flathub packaging / AUR submission (needs tag + release assets + maintainer).
- [ ] Auto-update/signing.
- [ ] Apple Sign-In (χρειάζεται Apple Developer account).
- [ ] Store screenshots/metadata/versioning.

## P3 — Launch readiness

- [x] Landing live, mobile pricing, relative assets, no-cache, refund/terms/safety pages.
- [x] Press screenshots/brand assets/generator.
- [x] Live app: Home/Calendar/Goals/Programs/Progress/History/Community/Exercises/Skills/Achievement/Body/Settings 320/390/1440 smoke.
- [x] PWA install path documented.
- [x] Native local app built/installed.
- [ ] Visual review Batch 2–10 από Aggelos.
- [ ] Beta group 5–10 άτομα, πραγματικά workouts/feedback.
- [x] Launch copy draft: `docs/LAUNCH-COPY-2026-11-03.md`.
- [ ] Product Hunt/HN/Reddit publishing (μόνο μετά από review).
- [ ] Support inbox + refund process.
- [ ] Rollback plan: `npm run deploy:rollback`, DB backup, API previous binary.
- [ ] Analytics: κανένα tracking χωρίς consent· απόφαση αν χρειάζεται.

## Go / No-Go

**Go όταν:** payment KYC/provider smoke PASS, no critical visual/accessibility bug, 7-day live stability, backup verified, refund/terms links σωστά.

**No-Go αν:** ανοιχτό VAT/payment θέμα, test failures, live 5xx, ή μη ελεγμένο checkout.

## Χρειάζεται από Aggelos

1. Paddle KYC/IBAN/ΑΦΜ (ή έγκριση Polar fallback).
2. Visual review των live flows.
3. Απόφαση για AppImage/Flathub μετά το `.deb`.
