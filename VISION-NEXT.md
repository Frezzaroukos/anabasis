# Anabasis — Vision Next (τα 5 μέτωπα του Aggelos, 2026-08-07)

> Καταγραφή των αιτημάτων ώστε να τα πιάσουμε με σειρά, όχι όλα μαζί μισά.

---

## ✅ 1. Χρώματα / theme — ΕΓΙΝΕ (commit ee60bb4)
- Accent picker (7 παλέτες), default **Ocean** αντί χρυσού.
- Το χρυσό μένει **μόνο για τα ρεκόρ** (επίτευξη = χρυσό, universal).
- **Ανοιχτό:** ο Aggelos ήθελε να συζητήσουμε ποιο θα είναι το κύριο. Τώρα διαλέγει ελεύθερα — πες αν θες
  διαφορετικό default ή περισσότερες παλέτες / πλήρες color-wheel.

---

## 🔜 2. «Add workout» αντί «Start workout» — ημερολογιακή λογική (Enthymion/Notion, πιο εξελιγμένο)
**Το πρόβλημα:** τώρα μόνο *live start*. Δεν προσθέτεις «χθες έκανα αυτό» ούτε προγραμματίζεις μελλοντικό.
Το Notion σου (Warrior Calendar) έχει workouts ως entries με **Date + Status** (Done/skip/planned).

**Σχέδιο (μεσαία αλλαγή):**
- `addWorkoutAt(date, activityKind)` — workout με `started_at` = επιλεγμένη ημερομηνία (past/future).
- Το **Ημερολόγιο γίνεται το κέντρο**: tap σε μέρα → «Add workout» → γέμισε με **quick-log** (ήδη υπάρχει,
  ιδανικό για past: «Bench 80 5,4,3,2»).
- **Status** ανά workout: planned / done / skipped (όπως το Notion σου).
- Το «Start workout» hero γίνεται «**+ Workout**» → sheet: [σήμερα-live] ή [άλλη μέρα] ή [προγραμματισμός].
- Backward-compatible: το live logging μένει ως έχει, απλά είναι *μία* από τις επιλογές.

**Effort:** ~1-2 συνεδρίες. **Το πιο υλοποιήσιμο επόμενο.**

---

## 🔮 3. Logo + social + ranks + animations
**3a. Logo (AI-generated βελτιωμένο):** χρειάζεται εξωτερικό image-AI (Midjourney/DALL·E/τοπικό SDXL).
Το τρέχον SVG (κλιμακωτή γραμμή) είναι καθαρό αλλά minimal. Μπορώ να δώσω **prompt + brief** για AI logo,
ή να φτιάξω πιο εξελιγμένο SVG. Πες προτίμηση.

**3b. Animations/movements:** έχουν μπει τα θεμέλια (pr-pulse, set-commit, hero active-scale). Επόμενα ιδέες:
skill-unlock «ανεβαίνει σκαλί», streak flame, chart draw-in, page transitions (διακριτικά, με reduced-motion).

**3c. Social + ranks — ⚠️ ΑΠΑΙΤΕΙ BACKEND (δεν γίνεται local):**
- Profile για σένα ✅ (υπάρχει — προφίλ ανά συσκευή)
- **Φίλοι + leaderboards + rank ανά άσκηση / ανά κοινό workout** → χρειάζεται **accounts + shared cloud data**.
  Αυτό είναι το **cross-device/Supabase** που δεν έχουμε ακόμα. **Prerequisite: #4 του παλιού roadmap (auth+sync).**
- Ρεαλιστικά: social/ranks = **μετά** το backend. Είναι ολόκληρο υπο-project (matchmaking, privacy, anti-cheat).

---

## 🚀 4. Deploy + AXON dashboard + monetization
**4a. Προσωρινό home κάτω από axonos.dev:**
- `anabasis.axonos.dev` μέσω του **υπάρχοντος Cloudflare tunnel** (γρήγορο) ή **Cloudflare Pages** (σωστό, 24/7).
- ⚠️ Tunnel = ζει όσο το PC. Για portfolio link → **Pages** (static, πάντα ζωντανό).

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
1. **#2 Add-workout** (υλοποιήσιμο τώρα, μεγάλο UX win, ταιριάζει στη ροή σου) →
2. **Deploy σε Pages + anabasis.axonos.dev** (ζωντανό link) →
3. **Backend/Supabase** (ξεκλειδώνει social/ranks + Pro tier) →
4. **Social/ranks + monetization** →
5. Logo/animations παράλληλα (χαμηλού ρίσκου, όποτε).

⚠️ Πριν οτιδήποτε public: **rotate το GitHub PAT.**
