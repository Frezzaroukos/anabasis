# Anabasis — Project Scope

> **Weighted calisthenics & skill progression tracker.** Όχι generic gym app. Όχι nutrition tool.

---

## 1. Positioning

**One-liner**: The first lifting app built for athletes who train *both* weighted basics (pull-ups, dips, pistol squats) *and* skill progressions (front lever, planche, muscle up).

**Target user**: Calisthenics-focused lifter, 16–35, intermediate-to-advanced, tracks training systematically, frustrated with generic apps (Strong, Hevy, Jefit) that treat skills as an afterthought.

**Wedge**: Skill progression tree. Every skill broken into 4–6 unlock steps with video benchmarks and hold-time targets. No app does this well.

**Pricing model** (deferred — post v1 launch):
- Free: 3 active programs, 30-day history, core logger
- Pro: €4.99/μήνα ή €39 lifetime — unlimited history, all skill trees, Notion sync, advanced analytics

---

## 2. Capabilities (what it does)

### v1 — Launch (8–12 weeks)

#### 2.1 Workout logger
- Sets / reps / weight live entry
- Bodyweight + added weight (separate fields για weighted calisthenics)
- Quick-add from previous session ("repeat last")
- Inline notes per exercise
- Session timer (auto-start on first set)

#### 2.2 PR tracker
- Auto-detected PR per exercise (max weight × reps)
- e1RM (estimated 1-rep max) with Epley/Brzycki formulas
- PR history timeline per exercise
- "PR" badge στη feed όταν χτυπιέται

#### 2.3 Skill progression tree (the moat)
- 8 skills στο launch: Muscle Up, Front Lever, Back Lever, Planche, Handstand, Human Flag, OAC, V-Sit
- 4–6 unlock steps each με:
  - Hold time target (sec) ή reps
  - Video benchmark (embedded YouTube link, no upload)
  - Prerequisite checklist
- "Current step" + "Next unlock" UI
- Mark step as achieved με date stamp

#### 2.4 Session flow
- Active workout view (full-screen, gym-optimized)
- Rest timer με auto-start μετά από set logging
- Plate calculator (barbell + plates στα δίπλα)
- Quick exit / resume

### v2 — Post-launch (3–6 μήνες after v1)

| Feature | Why v2 |
|---|---|
| Workout programs/templates (push/pull/legs, custom splits) | Retention driver, χρειάζεται user data πρώτα |
| Auto-progression algorithm (double progression, RPE-based) | Complex, needs validated data, easy to fuck up |
| RPE tracking | Optional layer πάνω από v1 logger |
| Volume analytics (kg/εβδομάδα ανά muscle group) | Needs accumulated data |
| Notion 2-way sync | Niche, premium tier |
| Cross-app event bridge → Calorie app | Στέλνει `workout.completed` event |

### v3+ — Future
- Form-check video uploads + community feedback
- Coach/athlete pairing
- Custom skill tree builder (user-defined progressions)

---

## 3. Boundaries — τι ΔΕΝ κάνει

> **⚠️ Αναθεώρηση 2026-08 (ενοποίηση):** το αρχικό scope έλεγε ότι
> θερμίδες/βάρος/macros/cardio ανήκουν σε ξεχωριστό app. Αυτό **άλλαξε**:
> το Anabasis είναι πλέον ΕΝΙΑΙΟ personal training app. Ενσωματώθηκαν:
> βάρος, θερμίδες, macros (protein/carbs/fat), λίπος σώματος, cardio με
> απόσταση/ρυθμό/PR, ημερολόγιο πολλαπλών δραστηριοτήτων. Ο πίνακας παρακάτω
> κρατιέται ως ιστορικό της αρχικής απόφασης.

| Feature | Κατάσταση τώρα |
|---|---|
| ~~Calorie / weight / macros tracking~~ | ✅ **Ενσωματώθηκε** (BodyPage: βάρος, θερμίδες, protein/carbs/fat, BF%, macro donut) |
| ~~Cardio / distance / pace~~ | ✅ **Ενσωματώθηκε** (activity logger + PR απόστασης/ρυθμού + progress charts) |
| Πλήρες food database / barcode scan | ❌ Εκτός scope — το nutrition μένει στο επίπεδο macros/insights, όχι food-log app |
| HR zones / GPS route map | ❌ Strava-domain· καταγράφουμε distance/duration/pace, όχι live GPS |
| Meal planning / recipes | ❌ Out of scope |
| Sleep tracking | ❌ Out of scope |
| Social feed / leaderboards | ❌ Συνειδητά — σπάει το focused, privacy-first ethos |
| Photo progress pics | ⏳ Πιθανό future (body comp) |

---

## 4. Tech stack

**Frontend**: Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui
**State**: Zustand (lightweight, fits offline-first model)
**Storage**:
- Local: IndexedDB via Dexie.js (offline-first)
- Sync (Pro tier): Supabase (Postgres + Auth + RLS)
**PWA**: Workbox για service worker, Vite PWA plugin
**Charts**: Recharts (lightweight, React-native)
**Deploy**: Vercel (frontend) + Supabase (backend)

**Why όχι native React Native**: PWA gets to launch 5x faster, no app store gatekeeping, instant updates. Wrap σε Capacitor μετά αν χρειαστεί App Store presence.

---

## 5. Architecture principles

1. **Offline-first**: Όλα τα data writes πάνε σε IndexedDB πρώτα, sync background.
2. **Domain isolation**: Workout/Exercise/Skill data μένει σε αυτό το app. Profile data minimal (όνομα, units).
3. **Bilingual από day 1**: EN/EL. i18next setup.
4. **Mobile-first responsive**: Σχεδίαση 375px viewport, expand σε desktop.
5. **No food database, no body weight UI**: Boundaries hard-enforced στο schema.
6. **Schema versioned**: Migration system από v1.

---

## 6. Privacy & data

- **Free tier**: All data local-only, no account needed
- **Pro tier**: Sync via Supabase με end-to-end ownership (user can export full JSON anytime)
- **Account deletion**: One-click, immediate, irreversible
- **Analytics**: Plausible (privacy-friendly), no third-party trackers
- **No ads, ever**

---

## 7. Success metrics για v1

- 100 weekly active users σε 60 μέρες after launch
- 30%+ session-to-session retention
- ≥3 sessions/week median per active user
- Skill tree engagement: >50% των users έχουν τουλάχιστον 1 active skill
- Conversion to Pro: 5%+ μετά 30 μέρες free trial
