# README screenshot pipeline

Run from the repository root:

```bash
node scripts/screenshots/generate.mjs
```

The script starts Vite on a random loopback port (never the production ports),
opens a fresh headless browser context at 390×844 with 2× device pixels, and
creates a local `Demo` profile with deterministic synthetic training history in
the app's IndexedDB. API traffic is blocked, so the profile cannot sync or touch
the live server.

Each current navigation surface is captured into `docs/screenshots/`. The hero
uses Home, Calendar, Programs, and Exercises, then ImageMagick assembles those
four captures into an exact 1200×708 image. Playwright uses its bundled Chromium
when available and falls back to `/usr/bin/brave`.
