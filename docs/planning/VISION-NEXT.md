# Anabasis — Vision Next (τα 5 μέτωπα του Aggelos, 2026-08-07)

> Καταγραφή των αιτημάτων ώστε να τα πιάσουμε με σειρά, όχι όλα μαζί μισά.

> **Ενημέρωση 2026-08-28:** Landed από τότε: **#2 add-workout ✅** (commits
> `da94994`, `fa98d49`), **PR celebration ✅** (μέρος του "alive UI", commit
> `b9bf287`), **native desktop app ✅** (Tauri 2, commit `7646291`, 27/08 — δεν
> ήταν καν στη λίστα των 5 μετώπων, προστέθηκε). Ενεργό μέτωπο τώρα (§5
> παρακάτω): **accounts/auth + per-user sync backend (Rust/Axum, self-hosted) +
> admin role + πλήρες visual redesign** — σε εξέλιξη.

---

## ✅ 1. Χρώματα / theme — ΕΓΙΝΕ (commit ee60bb4)
- Accent picker (7 παλέτες), default **Ocean** αντί χρυσού.
- Το χρυσό μένει **μόνο για τα ρεκόρ** (επίτευξη = χρυσό, universal).
- **Ανοιχτό:** ο Aggelos ήθελε να συζητήσουμε ποιο θα είναι το κύριο. Τώρα διαλέγει ελεύθερα — πες αν θες
  διαφορετικό default ή περισσότερες παλέτες / πλήρες color-wheel.

---

## ✅ 2. «Add workout» αντί «Start workout» — ημερολογιακή λογική (Enthymion/Notion, πιο εξελιγμένο) — ΕΓΙΝΕ (commits `da94994`, `fa98d49`)
**Το πρόβλημα ήταν:** τότε μόνο *live start*. Δεν πρόσθετες «χθες έκανα αυτό» ούτε προγραμμάτιζες μελλοντικό.
Το Notion σου (Warrior Calendar) έχει workouts ως entries με **Date + Status** (Done/skip/planned).

**Τι έγινε (`queries.ts` → `startWorkout(activityKind, onDate?)`):**
- ✅ `startWorkout` δέχεται προαιρετικό `onDate: YYYY-MM-DD` — workout με `started_at` σε τοπικό μεσημέρι
  εκείνης της μέρας (past/future), ώστε να πέφτει σωστά σε calendar/history χωρίς UTC day-shift.
- ✅ Το **Ημερολόγιο** γίνεται σημείο εκκίνησης: tap σε μέρα → add workout → **quick-log** (ήδη υπήρχε,
  ιδανικό για past: «Bench 80 5,4,3,2»).
- ✅ Backward-compatible: το live logging μένει ως έχει, απλά είναι *μία* από τις επιλογές.
- ❌ **Δεν έγινε ακόμα:** ρητό `status` πεδίο planned/done/skipped στο `Workout` (δεν υπάρχει στο schema/types
  — βλ. `DATABASE_SCHEMA.md`). Ένα backdated/future workout υπάρχει σαν εγγραφή, αλλά δεν έχει κατάσταση
  «προγραμματισμένο vs έγινε» πέρα από το αν έχει `ended_at`/sets.

---

## 🔮 3. Logo + social + ranks + animations
**3a. Logo — ✅ ΕΓΙΝΕ (commits `7992795`, `9cf442c`):** rework σε "Α with a ladder" monogram / weighted
"Ascent" mark, χαρτσόαλ-μπλε σύστημα, brand assets regenerated. Όχι AI-generated τελικά — δικό μας SVG.

**3b. Animations/movements — μερικώς ΕΓΙΝΕ:** τα θεμέλια μπήκαν (pr-pulse, set-commit, hero active-scale) και
**PR celebration ✅ (commit `b9bf287`)** — pulse στο accent χρώμα + hero CTA "ζωντανό" στην Αρχική.
Ανοιχτά: skill-unlock «ανεβαίνει σκαλί», streak flame, chart draw-in, page transitions — μέρος του **πλήρους
visual redesign** που τρέχει τώρα (§5).

**3c. Social + ranks — ⚠️ ΑΠΑΙΤΕΙ BACKEND (δεν γίνεται local):**
- Profile για σένα ✅ (υπάρχει — προφίλ ανά συσκευή)
- **Φίλοι + leaderboards + rank ανά άσκηση / ανά κοινό workout** → χρειάζεται **accounts + shared cloud data**.
  ⚠️ Ενημέρωση: το «cross-device/Supabase» παρακάτω είναι **ξεπερασμένο** — το backend τώρα είναι δικό μας
  **Rust/Axum, self-hosted**, σε εξέλιξη (§5). Prerequisite παραμένει το ίδιο: accounts + sync πρώτα.
- Ρεαλιστικά: social/ranks = **μετά** το backend. Είναι ολόκληρο υπο-project (matchmaking, privacy, anti-cheat).

---

## 🚀 4. Deploy + AXON dashboard + monetization
**4a. Deploy — ✅ ΕΓΙΝΕ:** live στο [`anabasis.axonos.dev`](https://anabasis.axonos.dev) μέσω **Cloudflare
Pages** (στατικό build, 24/7, όχι tunnel-dependent). Επίσης native desktop app (Tauri 2) από 27/08 —
δες `README.md` §Run it.

**4b. AXON builds dashboard (κάτω από axonos.dev):**
- Μια σελίδα που δείχνει **δομημένα ό,τι έχεις**: Anabasis, Block Barbers, landing, κλπ — με status/link/screenshot.
- Ταιριάζει με το υπάρχον cockpit/landing. Κάν' το ένα «Projects» section στο axonos.dev.

**4c. Monetization — απόφαση:**
| Μοντέλο | Πότε βγάζει νόημα |
|---|---|
| **Δωρεάν** (exposure) | Αν στόχος = portfolio/career + χρήστες. Μεγαλύτερη έκθεση, μηδέν friction. |
| **Freemium** | Free core + Pro (€3-5/μήνα ή €30 lifetime): sync, φίλοι/ranks, unlimited history, advanced analytics. |
| **Paid** | Μόνο αν έχει μοναδικό value που δεν βρίσκεις αλλού — ρίσκο σε κορεσμένη αγορά (Strong/Hevy). |

**Σύσταση:** **Free core + Pro tier** (το Pro = sync+social, που ούτως ή άλλως θέλει backend/κόστος).
Το free φέρνει χρήστες & portfolio value· το Pro δικαιολογεί το server cost. Τιμές: **€3.99/μήνα ή €34 lifetime**
(κάτω από Strong/Hevy ~€5, πάνω από «δωρεάν με ads» — χωρίς ads, privacy-first ως διαφοροποιητικό).

---

## 🎯 Σειρά που προτείνω

~~1. #2 Add-workout~~ ✅ · ~~2. Deploy σε Pages + anabasis.axonos.dev~~ ✅ · ~~5. Logo/animations~~ ✅ (μερικώς, δες §3).
Μένουν:
1. **Backend (Rust/Axum, self-hosted)** — accounts/auth + per-user sync + admin role → **σε εξέλιξη τώρα, δες §5**
2. **Πλήρες visual redesign** — παράλληλα με το backend, δες §5
3. **Social/ranks + monetization** — μετά το backend (§3c)

⚠️ Πριν οτιδήποτε public: **rotate το GitHub PAT.**

---

## 🔧 5. Ενεργό μέτωπο τώρα (2026-08-28) — backend + redesign

Δύο παράλληλα μέτωπα σε εξέλιξη σήμερα, το ένα prerequisite του άλλου (social/ranks §3c, Pro tier):

**5a. Accounts / auth + per-user sync backend — Rust/Axum, self-hosted**
- Αντικαθιστά οριστικά το παλιό πλάνο "Supabase Pro tier" (ήταν stub σε `src/lib/sync/index.ts` — no-op μέχρι σήμερα).
- Δικός μας server, όχι managed BaaS: auth (login/register), per-user data isolation, sync endpoint που δέχεται
  τις ήδη υπάρχουσες `updated_at`-based last-write-wins εγγραφές από το Dexie schema (βλ. `DATABASE_SCHEMA.md`
  §"Server sync") — το data layer ήταν έτοιμο για αυτό από το v1 (UUIDs, soft-deletes, `updated_at` παντού).
- **Admin role** — νέο: κάποιος λογαριασμός με δικαιώματα πέρα από το δικό του user_id (moderation/support/δικά
  μας analytics dashboards). Δεν υπάρχει ακόμα `role`/`is_admin` πεδίο στο `User` type — έρχεται με αυτό το μέτωπο.
- Guest mode χωρίς λογαριασμό παραμένει: το app δουλεύει πλήρως πριν κάνεις εγγραφή, ο λογαριασμός προσφέρει
  *sync*, δεν είναι *φράγμα εισόδου* (ίδια αρχή με το παλιό πλάνο, απλά διαφορετικός server).

**5b. Πλήρες visual redesign**
- Πέρα από το μερικό design pass που έγινε (§1, §3a, §3b) — ολόκληρο πέρασμα, όχι μεμονωμένα κομμάτια.
- Ζητάει τη δική του σχεδιαστική κατεύθυνση από τον Aggelos πριν προχωρήσει σε implementation — δεν
  προκαταλαμβάνουμε εδώ τι θα αλλάξει, απλά καταγράφουμε ότι είναι ενεργό μέτωπο.
