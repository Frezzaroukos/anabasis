# Anabasis

Weighted calisthenics & skill progression tracker. PWA, offline-first, bilingual (EN/EL).

> Source of truth: see [`PROJECT_SCOPE.md`](./PROJECT_SCOPE.md) and [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md). Do not deviate.

## Stack

- Vite 5 · React 18 · TypeScript (strict)
- Tailwind 3 · shadcn/ui · lucide-react
- Zustand (state) · Dexie 4 (IndexedDB, offline-first)
- React Router 6 · Recharts
- vite-plugin-pwa + Workbox
- i18next + react-i18next (EN/EL)

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc -b && vite build
npm run typecheck    # type check only
```

## Folder layout

```
src/
  app/          routes & layouts
  features/     workout, history, skills, settings, exercises, prs
  lib/
    db/         Dexie schema, seeds, bootstrap, types
    domain/     pure functions (e1RM, volume, PR detection)
    sync/       Supabase sync stub (Pro tier)
  components/
    ui/         shadcn primitives
    layout/     app shell pieces
  hooks/
  i18n/         en.json, el.json, init
  styles/       globals.css
```

## Architecture rules

1. **Offline-first.** Every write hits Dexie. Sync layer is a stub for v1.
2. **No `localStorage` for app data** — everything goes through Dexie. (Exception: i18next stores the resolved language code.)
3. **Mobile-first**, 375px base viewport.
4. **Schema versioned** via `SCHEMA_VERSION` in `src/lib/db/schema.ts`. Bump + add migration when fields change.
5. **System data has stable UUIDs** (see `src/lib/db/seeds.ts`) — never reuse an id.

## Status

v1 scaffold. Workout logger UI, PR auto-detection, and skill tree UI come next, one feature per session.
