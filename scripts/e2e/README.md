# E2E smoke

```bash
npm run e2e        # node scripts/e2e/smoke.mjs
```

Builds a throwaway bundle into `/tmp/anabasis-e2e`, serves it with
`vite preview` on a free loopback port, and drives the real app with the
Playwright library. Every browser context starts with empty IndexedDB; `/api/**`
is blocked, so the flows are offline/local-first with no login.

Covered flows: log a workout, edit a set and reload, delete a set/workout and
Undo, body measurement add/edit/delete, CSV export + data integrity, custom
activity create/delete, set/exercise delete + Undo, planner create/edit/delete
plus today's planned → done, goals archive/unarchive, programs
create/edit/duplicate, exercise delete and history-blocked message, and the
keyboard skip link. Each flow runs at 390px and 320px and fails on console
errors, page errors, horizontal overflow or a missing element. Failure
screenshots go to `/tmp/anabasis-e2e-shots/`.

The preview process is killed by PID at the end (only the one this script
started). No live service or production port is touched.
