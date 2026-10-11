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
- Deploy: `npm run build` (γράφει στο live dist/ — backup πρώτα) · API: `cargo build --release` + restart anabasis-api (backup DB με sqlite .backup)
- Public repo: commit messages χωρίς AI trailers · ποτέ fake χρήστες/μετρικές
