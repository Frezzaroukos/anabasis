# Anabasis · Ἀνάβασις

**Weighted calisthenics & skill progression tracker.** Offline-first PWA, bilingual (EN/EL).

> *Anabasis* — «η ανάβαση». Κάθε skill είναι μια σκάλα: tuck → advanced tuck → straddle → full.
> Η εφαρμογή υπάρχει για να δείχνει σε ποιο σκαλί είσαι και ποιο είναι το επόμενο.

---

## Why

Οι generic gym apps (Strong, Hevy, Jefit) αντιμετωπίζουν τα **skills** ως afterthought.
Αν προπονείσαι front lever, planche ή muscle-up, δεν καταγράφεις «σετ × επαναλήψεις» —
καταγράφεις **πρόοδο σε μια αλυσίδα προαπαιτούμενων**, με hold-times και τεχνικά ορόσημα.

Το Anabasis είναι χτισμένο για αθλητές που κάνουν **και τα δύο**: weighted basics
(pull-ups, dips, pistol squats) **και** skill progressions.

## Features

| | |
|---|---|
| **Skill progression tree** | 8 skills (Muscle Up, Front Lever, Back Lever, Planche, Handstand, Human Flag, One Arm Chin-up, V-Sit), 4–6 βήματα το καθένα με στόχους hold/reps. Τα κλειδωμένα βήματα παραμένουν ορατά — βλέπεις πού πας. |
| **Workout logger** | Live καταγραφή σετ, ξεχωριστά πεδία bodyweight + added weight (για weighted calisthenics), session & rest timers, warm-up / failure flags. |
| **PR tracking** | Αυτόματη ανίχνευση σε 5 τύπους (max weight, reps, volume, e1RM, hold). Τα warm-ups εξαιρούνται. e1RM με Epley/Brzycki. |
| **Offline-first** | IndexedDB (Dexie). Δουλεύει χωρίς δίκτυο, εγκαθίσταται ως PWA. |
| **Δικά σου δεδομένα** | Πλήρες JSON export/import με ένα κλικ. Τίποτα δεν κλειδώνεται. Κανένας server. |
| **Δίγλωσσο** | Πλήρες EN/EL i18n. |

## Stack

Vite 5 · React 18 · **TypeScript (strict)** · Tailwind 3 · shadcn/ui · Zustand ·
**Dexie 4** (IndexedDB) · React Router 6 · Recharts · vite-plugin-pwa + Workbox ·
i18next · Vitest

## Architecture

```
src/
├── app/          routes + AppShell (bottom tab nav)
├── features/
│   ├── workout/  logger: ActiveWorkoutView, SetRow, RestTimer, SessionTimer
│   ├── skills/   progression tree: list + detail ladder
│   ├── history/  completed sessions + recent PRs
│   └── settings/ language, units, rest presets, export/import
├── lib/
│   ├── db/       Dexie schema, typed queries, seeds, migrations
│   │             (τα components ΠΟΤΕ δεν καλούν db.* απευθείας — μόνο μέσω queries)
│   └── domain/   pure logic: e1rm, pr, volume  ← unit-tested
└── i18n/         en.json · el.json
```

**Σχεδιαστικοί κανόνες**
- Το `lib/domain` είναι καθαρές συναρτήσεις, ανεξάρτητες από DB/UI → testable.
- Κάθε πρόσβαση σε δεδομένα περνά από το `lib/db/queries` (soft-delete, `updated_at` stamping).
- Τα seed IDs είναι σταθερά UUIDs ώστε ένα μελλοντικό sync να μη διπλο-εισάγει.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (domain logic)
npm run build    # production + service worker
```

## Status

v1 σε εξέλιξη. **Έτοιμα:** workout logger, skill progression tree, PR tracking,
export/import, i18n, PWA. **Επόμενα:** charts προόδου, προγράμματα, nutrition module.

## Docs

- [`PROJECT_SCOPE.md`](./PROJECT_SCOPE.md) — positioning, capabilities, roadmap
- [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md) — πίνακες & σχέσεις

---

Χτίστηκε ενοποιώντας έξι προηγούμενες προσπάθειες σε ένα προϊόν.

## Run locally (desktop app)

Το Anabasis τρέχει ως **systemd user service** και ανοίγει ως αυτόνομο παράθυρο:

```bash
npm run build
systemctl --user enable --now anabasis     # σερβίρει το dist στο :8120
```

- **Desktop app:** `Mod+A` (Niri) ή από το app launcher («Anabasis»)
- **Browser:** http://localhost:8120
- **Άλλες συσκευές** (κινητό/tablet μέσω Tailscale): `http://<tailnet-ip>:8120` — και «Add to Home Screen» για PWA install

Ο `serve.py` κάνει SPA fallback (deep links σε skills δουλεύουν σε refresh) και
θέτει no-cache στο index/service-worker ώστε τα updates να φτάνουν.
