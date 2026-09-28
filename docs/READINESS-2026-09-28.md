# Readiness audit — 2026-09-28

Scope: repository readiness for a public, local-first PWA and its optional sync API. This is a code/configuration audit, not a live-production certification: the night-shift rules explicitly prohibited deploys, restarts and live-service changes.

## Verdict

**Ready for a reviewed release, 8.6/10.** No open P1 or P2 was found after the fixes below. The product build and both test suites pass locally. Remaining gaps are operational/documentation improvements that do not block a release, but they do block calling the service fully production-hardened.

## Score by axis

| Axis | Score | Evidence and assessment |
|---|---:|---|
| Core product / UX | 9.0 | The application is usable without signup and supports export/import (`README.md:33-47`). The empty-dashboard workout CTA now points to the calendar, the actual logging entry point (`src/features/dashboard/components/EmptyDashboardHint.tsx:42-47`). |
| Data integrity / recovery | 9.0 | IndexedDB migrations and soft-delete sync are covered by the frontend suite; server epoch handling protects clients after DB restore (`server/src/app.rs:60-63`, `server/tests/integration.rs:792-815`). Export remains available without cloud (`README.md:45-47`). |
| Privacy / account lifecycle | 9.0 | Cloud/social are opt-in, raw training data is account-scoped, and the UI now explains storage/sharing (`src/i18n/en.json:301-304`). Authenticated permanent deletion removes account-owned server rows in one transaction (`server/src/auth.rs:443-490`) and requires typed email confirmation (`src/features/account/AccountCard.tsx:476-505`). |
| Security | 8.5 | Argon2id, opaque revocable sessions, origin allowlist, request-size limits and per-surface rate limits are implemented (`server/src/app.rs:147-245`). The production static server now emits CSP, anti-framing, MIME-sniffing, referrer and permissions headers (`serve.py:23-33`). No independent penetration test was performed. |
| Reliability / offline | 8.5 | The PWA build precaches application assets and update reloads are guarded against first-install/double reload (`src/lib/pwa.ts:1-18`). Root and GitHub Pages subpath manifest targets are now derived from the same base (`vite.config.ts:6-45`). No live outage/failover exercise was allowed in this lane. |
| Automated verification | 9.0 | CI runs typecheck, zero-warning lint, frontend tests/build and now locked Rust tests (`.github/workflows/ci.yml:22-39`). Local verification on 2026-09-28: Vite build passed; 473 frontend and 64 backend tests passed. |
| Operations / observability | 7.5 | The API has an unauthenticated health endpoint with version/epoch (`server/src/app.rs:255-261`) and binds to loopback by default (`server/src/main.rs:83-97`). Backup/systemd procedures are referenced in repository docs but their executable definitions live outside this public repository, so restore readiness is not reproducible from a fresh clone. |
| Documentation / maintainability | 8.5 | Architecture, API contract, local run path and feature status are documented. Test counts and commands in the README were corrected in this pass. Deployment and incident-response runbooks remain external/implicit. |

## Closed gaps

### P1 — release blockers

- **Account deletion was absent from the public account lifecycle.** Added authenticated API contract, transactional server deletion, email-confirmation UI, auth cleanup/local-profile isolation, and server/client tests. This closes the material privacy and user-control gap.
- **Backend regressions could merge with a green CI badge.** Added `cargo test --locked` to the main CI verification job.
- **Installed GitHub Pages PWA could escape the `/anabasis/` scope.** Manifest `start_url`, icons and shortcuts now use `BASE_PATH`, matching the router/build base.

### P2 — important before release

- **Production static responses lacked baseline browser security headers.** Added CSP, COOP, Permissions-Policy, Referrer-Policy, `nosniff` and anti-framing headers.
- **A service worker's first install could cause an unnecessary reload.** Reload now occurs once only when the page was already controlled, with focused unit coverage.
- **First-workout guidance targeted the body page instead of the calendar logger.** Corrected the route and copy.
- **Users had no concise in-product privacy explanation.** Added bilingual storage, sync, social visibility, export and deletion disclosure.
- **README verification claims had drifted.** Updated the frontend/backend commands and observed suite counts.

## Remaining gaps

### P3 — follow-up, not release-blocking

- Put the production service definition, backup command and a tested restore drill/runbook under version control without secrets. Current repository evidence describes them but does not let a new operator reproduce them.
- Add synthetic monitoring against `/api/health` and the static shell, plus an alert destination and ownership/response expectations. The endpoint exists; the monitoring policy is not represented here.
- Add a dependency-update policy and scheduled dependency/security scanning. This audit did not use network-backed vulnerability databases, so it makes no claim that the dependency graph is free of newly disclosed CVEs.
- Add browser-level release smoke coverage for install/update, offline launch, signup→sync→logout, and export→import. Unit/integration coverage is strong, but those cross-boundary journeys are not an automated release gate.
- Replace manually maintained README test totals with wording or CI-generated badges that cannot drift.

## Verification record

Run sequentially to avoid concurrent load:

```text
npx tsc --noEmit                         PASS
npx vite build --outDir /tmp/anabasis-verify  PASS
npx vitest run                           PASS — 69 files, 473 tests
cd server && cargo test                  PASS — 5 unit + 59 integration tests
```

The final verification after all fixes is the authoritative record; no `npm run build`, push, deploy or live-service mutation was performed.
