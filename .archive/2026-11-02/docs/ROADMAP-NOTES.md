# 🧭 Anabasis — Roadmap Notes (partner session, read-only prep)

> **Ποιος το έγραψε:** το *partner / backup* session (Claude Opus 5), 2026-09-04→05,
> ενώ η **primary** έκανε τα code edits. **ΜΗΔΕΝ code edits από εδώ** — μόνο αυτό
> το αρχείο, ώστε να μη συγκρουστούμε στο ίδιο repo.
>
> **Σκοπός:** να μπει η primary (ή νέο session) και να υλοποιήσει το §7 του
> `CLAUDE.md` **χωρίς να ξανακάνει την έρευνα**.
>
> **Ground truth = ο κώδικας.** Κάθε finding έχει `file:line` — verify πριν το
> πιάσεις, ο κώδικας μπορεί να έχει κουνηθεί από την primary.
>
> **Live coordination (2026-09-05):** όσο γραφόταν αυτό, η primary δούλευε στο
> §7.6 (share/QR — `ShareCard.tsx`, `public/share-qr.svg`, i18n `share.*`).
> Το §3.3 παρακάτω είναι ενημερωμένο ώστε να ΜΗΝ διπλογράψουμε.
>
> **Δεν έτρεξα `npm run build` / `vitest`** επίτηδες: γράφουν σε `dist/` και
> `node_modules/.vite` και θα έτρωγαν το build της primary. Health check πριν
> πιάσεις μέτωπο.

---

## 0. TL;DR — τι να πιάσεις πρώτο

| # | Τι | Γιατί τώρα | Κόστος |
|---|---|---|---|
| 1 | **16px inputs** (`ui/input.tsx`) | Το iOS ζουμάρει σε ΚΑΘΕ tap σε πεδίο· ~40 taps/προπόνηση | 1 γραμμή + sweep |
| 2 | **`<AppBar>` με πραγματικό back** | 9 σελίδες δεν έχουν ΚΑΝΕΝΑ back· σε installed PWA είσαι εγκλωβισμένος | ~1 component + AppShell |
| 3 | **Android back → κλείσε sheet, όχι το app** | Ανοιχτό sheet + back = βγαίνεις από το app, χάνεις τη φόρμα | ~1 hook |
| 4 | **`overscroll-behavior`** | Pull-to-refresh στο Android κάνει reload μέσα στην προπόνηση | 2 γραμμές CSS |
| 5 | **SW reload gate** (`main.tsx`) | Deploy μέσα σε ενεργή προπόνηση = hard reload | ~5 γραμμές |
| 6 | **Google OAuth wiring** | Ο κώδικας είναι ΗΔΗ εκεί, λείπουν μόνο credentials | ~30′ (console + env) |

Τα 1–5 είναι το «mobile UX» του §7.1/§7.2 και μαζί δεν είναι πάνω από μία
συνεδρία. Το 6 είναι το φθηνότερο win όλου του §7.

---

# 1. Navigation σε installed PWA — έρευνα + αρχιτεκτονική

## 1.1 Το πρόβλημα, μετρημένο στο ΔΙΚΟ μας repo

Δεν είναι θεωρητικό. Τι βρήκα με grep:

- **`navigate(-1)`: 0 εμφανίσεις σε όλο το `src/`.** Δεν υπάρχει πουθενά
  πραγματικό «πίσω».
- **`popstate` / `pushState`: 0 εμφανίσεις** (πλην ενός `replaceState` για
  καθάρισμα OAuth fragment, `src/lib/api/auth.ts:134`). Άρα τα sheets/dialogs
  **δεν** συμμετέχουν στο history.
- **Δεν υπάρχει app-level top bar.** Κάθε σελίδα φτιάχνει το δικό της `<header>`
  *μέσα* στο scroll content (`AppShell.tsx:36` → `<main>` με `Outlet`), οπότε ο
  τίτλος φεύγει με το scroll και δεν υπάρχει σταθερό chrome.
- **5 σελίδες** έχουν ένα «← <γονιός>» text link σε **hardcoded** προορισμό:
  - `history/WorkoutDetailPage.tsx:189` → `/history`
  - `exercises/ExerciseDetailPage.tsx:80` → `/exercises`
  - `progress/ProgressPage.tsx:94` → `/history`
  - `import/ImportPage.tsx:161` → `/settings`
  - `branding/BrandingPage.tsx:27` → `/settings`
  Δηλαδή: αν μπεις στο `/exercises/:id` **από το Calendar ή από ένα Program**, το
  «← Ασκήσεις» σε πετάει σε λίστα από την οποία ποτέ δεν ήρθες. Είναι *up*, όχι
  *back*, και με λάθος up σε μισές περιπτώσεις.
- **9 σελίδες δεν έχουν ΤΙΠΟΤΑ:** `SkillDetailPage`, `ProgramDetailPage`,
  `GoalsPage`, `ActivitiesPage`, `AdminPage`, `ProfilePage`, `AchievementsPage`,
  `BodyPage`, `HistoryPage`. (Το `ChevronLeft` στο `ProgramDetailPage.tsx:394`
  είναι move-day, όχι back.)
- **9 από ~20 προορισμούς ζουν ΜΟΝΟ μέσα στο «Περισσότερα» sheet**
  (`navItems.ts` → `SECONDARY_NAV`): Goals, Progress, History, Skills,
  Achievements, Body, Profile, Import, Settings. 2 taps + sheet, χωρίς μνήμη
  του τι χρησιμοποίησες τελευταία φορά.

**Το αποτέλεσμα σε installed PWA** (`manifest.display: 'standalone'`,
`vite.config.ts`): δεν υπάρχει browser back, δεν υπάρχει URL bar. Στο **iOS**
δεν υπάρχει ούτε swipe-back (γνωστό WebKit κενό — δες 1.2). Άρα από το
`/skills/:id` ο μόνος τρόπος να φύγεις είναι ένα bottom tab, που σε πετάει σε
ρίζα. Στο **Android** το hardware back δουλεύει, αλλά στη ρίζα **κλείνει το
app** — και με ανοιχτό `BottomSheet` (π.χ. `GoalFormSheet`) το back **δεν
κλείνει το sheet**, κλείνει το app και χάνεται η φόρμα.

## 1.2 Τι λέει το πεδίο (2026) — τα σημαντικά

**Navigation API: Baseline “Newly available” από Ιανουάριο 2026.**
Chrome/Edge, Firefox 147, **Safari 26.2**. Το `navigation.canGoBack` πλέον
απαντάει *σωστά* στο «μπορώ να πάω πίσω;» — κάτι που το `history.length` ποτέ
δεν έκανε αξιόπιστα. Caveat: γίνεται `false` όταν η προηγούμενη εγγραφή είναι
cross-origin.
→ Είναι **χρησιμοποιήσιμο, με fallback**: ο κόσμος σε iOS 18/19 δεν έχει Safari
26.2 για κάμποσο ακόμα, οπότε θέλει feature-detect + δικό μας stack.

**iOS standalone swipe-back: δεν υπάρχει, και δεν φτιάχνεται.**
Επιβεβαιωμένο σε Apple Developer Forums + Ionic issues (#29733, #22299): όταν
το PWA είναι στο home screen, τα back/forward gestures δεν υπάρχουν καθόλου.
Τα workarounds (touchstart στα edges + `preventDefault`) είναι εύθραυστα και το
native behaviour τα παρακάμπτει όσο η σελίδα scroll-άρει.
→ **Συμπέρασμα: ο in-app back button ΔΕΝ είναι nice-to-have στο iOS, είναι η
μοναδική διέξοδος.**

**Android hardware back:** το `popstate` όντως πυροδοτείται. Το καθιερωμένο
pattern για overlays είναι: όταν ανοίγει modal → `pushState` μια εγγραφή· στο
`popstate` → κλείσε το modal· όταν κλείνει με το χέρι → `history.back()`.
Το να «μπλοκάρεις» τελείως ένα back θέλει clone-entries και είναι θολό — **δεν
το προτείνω**· για την έξοδο από τη ρίζα αρκεί ένα confirm.

**Display modes:** σε standalone αλλάζει το διαθέσιμο ύψος viewport (φεύγει το
browser chrome) και στο Android παίζει ρόλο και η system nav bar — γι' αυτό
`dvh`, όχι `vh` (δες §2, issue **M-8**).

## 1.3 Detection — τι είμαστε

```ts
// src/lib/platform.ts  (ΝΕΟ αρχείο — ΟΧΙ στο queries.ts, βλ. CLAUDE.md §9)
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  // iOS Safari legacy: το μόνο σήμα σε παλιά iOS
  (navigator as { standalone?: boolean }).standalone === true;

export const isTauri = () => '__TAURI_INTERNALS__' in window;
export const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
```

Gotchas:
- `display-mode: minimal-ui` **έχει** browser back → δεν είναι «standalone».
- Στο **Tauri** (`src-tauri/`) δεν υπάρχει καθόλου browser chrome, οπότε
  συμπεριφέρεται σαν standalone — ίδιο treatment.
- Το `navigator.standalone` είναι **μόνο** iOS και deprecated· κράτα το ως OR.
- Στο desktop PWA (`window-controls-overlay`) υπάρχουν back/forward στο title
  bar σε Chrome — αλλά όχι πάντα ορατά· ασφαλέστερο να δείχνεις και δικό σου.

## 1.4 Προτεινόμενη αρχιτεκτονική

Πέντε κομμάτια, φθηνά, καθένα ξεχωριστό μέτωπο:

### A1 · `<AppBar>` — ένα σταθερό top bar στο AppShell
Sticky top bar στο `AppShell.tsx`, **πάνω** από το `<Outlet/>`, μόνο mobile
(`md:hidden` όπως το `BottomTabNav`) ή και σε desktop με πιο λιτή μορφή:
`[← back] [τίτλος σελίδας] [action slot]`.

- Ο τίτλος βγαίνει από ένα route→titleKey map δίπλα στο `navItems.ts`
  (ή `handle: { titleKey }` στα route objects του `routes.tsx` + `useMatches()`).
- Το back **δείχνεται μόνο όταν έχει νόημα** (δες A2).
- Οι σελίδες σταματούν να φτιάχνουν δικό τους `<header>` με h1 — καθαρίζει ~20
  αρχεία και δίνει μια γλώσσα.
- `safe-top` πάει στο AppBar, φεύγει από το `<main>`.

### A2 · `useCanGoBack()` — «υπάρχει πίσω;»
```ts
// src/lib/nav.ts (ΝΕΟ αρχείο)
import { useNavigationType } from 'react-router-dom';

// Μετράμε ΜΟΝΟ τα δικά μας pushes: ένα module-level counter που ανεβαίνει σε
// PUSH και κατεβαίνει σε POP. Δουλεύει και σε cold-start deep link (=0 → κρύψε
// το back, δείξε «up» αν το route έχει γονιό).
let depth = 0;
export function useCanGoBack(): boolean {
  const type = useNavigationType();          // 'POP' | 'PUSH' | 'REPLACE'
  if (type === 'PUSH') depth++;
  else if (type === 'POP') depth = Math.max(0, depth - 1);
  // Navigation API αν υπάρχει (Baseline 01/2026) — αλλιώς το counter μας.
  const nav = (window as { navigation?: { canGoBack: boolean } }).navigation;
  return nav ? nav.canGoBack && depth > 0 : depth > 0;
}
```
> **Προσοχή:** το παραπάνω είναι σκίτσο — σε StrictMode το render τρέχει 2×,
> οπότε το increment πρέπει να μπει σε `useEffect` με guard στο `location.key`,
> όχι στο render body. Το `location.key` του react-router είναι το σωστό
> κλειδί για dedup.

**Fallback όταν `canGoBack === false`** (cold start σε deep link — π.χ. άνοιξε
PWA shortcut ή shared link): δείξε **«up»** προς τον λογικό γονιό, από ένα
`PARENT_OF` map (`/exercises/:id` → `/exercises`, `/skills/:id` → `/skills`,
`/history/:id` → `/history`, `/programs/:id` → `/programs`). Δηλαδή κρατάμε τη
σημερινή συμπεριφορά **μόνο** ως fallback, όχι ως κανόνα.

### A3 · Overlays στο history (Android back = κλείσε το sheet)
Ένα hook που τον χρησιμοποιούν `BottomSheet` + `ConfirmDialog`:
```ts
// src/hooks/useHistoryDismiss.ts (ΝΕΟ)
export function useHistoryDismiss(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    history.pushState({ overlay: true }, '');
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // κλείσιμο με X/backdrop → κατανάλωσε τη δική μας εγγραφή
      if (history.state?.overlay) history.back();
    };
  }, [open, onClose]);
}
```
Κερδίζει **και** στο desktop: το back του browser κλείνει το modal αντί να
φεύγει από τη σελίδα. Θέλει προσοχή σε **στοιβαγμένα** overlays (δες M-6).

### A4 · Guard στη ρίζα (Android)
Στη ρίζα (`/`), ένα `popstate` = έξοδος από το app. Πάτημα #1 → toast «πάτα
ξανά για έξοδο» + `pushState` πίσω· πάτημα #2 μέσα σε 2s → άσ' το να φύγει.
**Κρίσιμο** αν υπάρχει ενεργή προπόνηση: εκεί δείξε το ίδιο `ConfirmDialog` που
ήδη υπάρχει για «τερματισμό».

### A5 · Tab-scoped stacks — **ΟΧΙ τώρα**
Το native iOS pattern (κάθε tab κρατά δικό του stack) είναι σωστό αλλά ακριβό
σε ένα `createBrowserRouter` setup, και το κέρδος είναι μικρό όσο έχουμε 4
primary tabs. **Skip.** Αντ' αυτού, φθηνό 80%: το «Περισσότερα» sheet να
θυμάται τον τελευταίο προορισμό και να τον δείχνει πρώτο.

## 1.5 Platform × μηχανισμός × caveat

| Platform | Browser back | Swipe back | Hardware back | Τι ΠΡΕΠΕΙ να δώσουμε |
|---|---|---|---|---|
| iOS Safari (tab) | ✅ | ✅ | — | in-app back είναι bonus |
| **iOS standalone PWA** | ❌ | ❌ (WebKit, άλυτο) | — | **in-app back = μοναδική διέξοδος** |
| Android Chrome (tab) | ✅ | ✅ | ✅ | in-app back είναι bonus |
| **Android standalone PWA** | ❌ | ~ (gesture→system back) | ✅ | overlay-dismiss + root guard |
| **Tauri desktop** | ❌ | ❌ | — | in-app back + keyboard (Alt+←) |
| Desktop browser | ✅ | ~ | — | SideNav αρκεί, back είναι bonus |

## 1.6 Anti-patterns — τι ΝΑ ΜΗΝ κάνουμε

- **Back σε modal/sheet.** Εκεί θέλει **X / «Άκυρο»**, όχι βέλος. Το βέλος
  υπονοεί πλοήγηση, το X υπονοεί «ακύρωσε ό,τι έγραψα».
- **Back στη ρίζα.** Αν το tab είναι ήδη ρίζα, το βέλος δεν πρέπει να υπάρχει —
  κενό κουμπί που δεν κάνει τίποτα είναι χειρότερο από καθόλου κουμπί.
- **Blocking navigation με clone-entries.** Θολό, σπάει σε forward. Άσ' το.
- **`history.length` ως «μπορώ πίσω;».** Λέει ψέματα (μετράει και άλλα origins).
- **A11y:** σε αλλαγή route κανείς δεν ανακοινώνει τίποτα σήμερα. Το AppBar
  λύνει και αυτό: `<h1>` μέσα του + `focus()` στο h1 σε route change (ή ένα
  `aria-live="polite"` που λέει τον τίτλο). Χωρίς αυτό, screen-reader χρήστης
  δεν καταλαβαίνει ότι άλλαξε σελίδα.

**Πηγές:** [web.dev — Navigation API Baseline](https://web.dev/blog/baseline-navigation-api) ·
[MDN Navigation.canGoBack](https://developer.mozilla.org/en-US/docs/Web/API/Navigation/canGoBack) ·
[InfoQ 05/2026](https://www.infoq.com/news/2026/05/navigation-api-browser/) ·
[Ionic #29733 — iOS PWA swipe back](https://github.com/ionic-team/ionic-framework/issues/29733) ·
[Apple Dev Forums — no back gesture in PWA](https://developer.apple.com/forums/thread/99579) ·
[Smashing — Optimizing PWAs for display modes](https://www.smashingmagazine.com/2025/08/optimizing-pwas-different-display-modes/) ·
[web.dev — PWA app design](https://web.dev/learn/pwa/app-design)

---

# 2. Mobile / responsive UX — concrete issues

Σειρά κατά impact. Όλα verified με grep/read στο repo, `file:line` δίπλα.

| id | Issue | Πού | Sev |
|---|---|---|---|
| M-1 | Inputs 14px → **iOS zoom σε κάθε focus** | `ui/input.tsx:16` | 🔴 |
| M-2 | Καθόλου back (δες §1.1) | παντού | 🔴 |
| M-3 | Android back με ανοιχτό sheet **κλείνει το app** | `ui/sheet.tsx` | 🔴 |
| M-4 | Χωρίς `overscroll-behavior` → pull-to-refresh reload | `globals.css` | 🟠 |
| M-5 | SW `controllerchange` → **άνευ όρων reload** | `main.tsx:39` | 🟠 |
| M-6 | `ConfirmDialog` δεν κλειδώνει scroll· nested sheets ξεκλειδώνουν | `ui/dialog.tsx`, `ui/sheet.tsx:30` | 🟠 |
| M-7 | Workout inputs `h-9` = 36px < 44px | `AddSetInline.tsx:220,238,258` | 🟠 |
| M-8 | `max-h-[85vh]` αντί `dvh` | `ui/sheet.tsx:55` | 🟡 |
| M-9 | `pb-24` / `pb-32` magic numbers χωρίς safe-area | `AppShell.tsx:36`, `ActiveWorkoutView.tsx:147` | 🟡 |
| M-10 | Χωρίς `safe-area-inset-left/right` (landscape notch) | `globals.css:135-140` | 🟡 |
| M-11 | Admin table `overflow-x-auto` χωρίς affordance στο κινητό | `AdminPage.tsx:109` | 🟡 |
| M-12 | Manifest: `orientation: portrait`, χωρίς `id`/`scope` | `vite.config.ts` | 🟡 |
| M-13 | 448px στήλη στα 448–768px (tablet portrait) | `AppShell.tsx:36` | 🟡 |
| M-14 | BrandingPage λέει «Altitude Violet», το design είναι «Carbon» | `BrandingPage.tsx:31` | ⚪ |

### M-1 · Inputs 14px → iOS zoom **(το #1)**
`src/components/ui/input.tsx:16` → `'flex h-10 w-full … px-3 py-2 text-sm …'`.
`text-sm` = **14px**. Το iOS Safari **ζουμάρει το viewport σε κάθε focus** όταν
το font-size ενός input είναι <16px. Και επειδή σωστά αφαιρέθηκε το
`user-scalable=no` (a11y, `index.html:7-11`), **δεν ξε-ζουμάρει μόνο του**.
Σε μια προπόνηση αγγίζεις βάρος/επαναλήψεις ~40 φορές → η σελίδα μένει μόνιμα
ζουμαρισμένη και οριζόντια μετατοπισμένη.

**Fix:** `text-base md:text-sm` στο base του `Input` (16px στο κινητό, 14px
πυκνότητα σε desktop). Ίδιο και για `<textarea>`/`<select>` αν υπάρχουν.
Sweep μετά για overrides που ξαναρίχνουν κάτω από 16 (π.χ.
`AddSetInline.tsx:193` `text-[11px]`).

### M-3 · Android back με ανοιχτό sheet
`ui/sheet.tsx` κλείνει μόνο σε Escape/backdrop. Σε Android PWA το back δεν
βλέπει το sheet → βγαίνεις από το app. Fix = **A3** (§1.4).

### M-4 · `overscroll-behavior`
`rg 'overscroll' src` → **0 αποτελέσματα**. Δύο συνέπειες:
1. **Android Chrome pull-to-refresh**: swipe κάτω στο scroll-top → **reload**.
   Τα δεδομένα είναι ασφαλή (IndexedDB) αλλά χάνεται η μισοσυμπληρωμένη φόρμα,
   το ανοιχτό sheet, το state του rest timer.
2. **Scroll chaining** πίσω από sheets — το `document.body.style.overflow='hidden'`
   (`sheet.tsx:30`) **δεν** το σταματά στο iOS.

**Fix:** `body { overscroll-behavior-y: contain; }` στο `globals.css` +
`overscroll-contain` στο scroller του sheet (`sheet.tsx:69`) και στο
`ActiveWorkoutView.tsx:147`.

### M-5 · Άνευ όρων reload σε νέα έκδοση
`src/main.tsx:39-46`: σε `controllerchange` → `location.reload()`. Σωστό ως
πρόθεση (stale SW), λάθος ως χρονισμός: ένα deploy **μέσα** σε ενεργή προπόνηση
κάνει hard reload. **Fix:** gate — αν υπάρχει active workout ή ανοιχτό sheet,
μην κάνεις reload· δείξε toast «Νέα έκδοση — πάτα για ανανέωση» και άφησέ το
στον χρήστη. (Το `useActiveWorkout` ήδη υπάρχει, `AppShell.tsx:9`.)

### M-6 · Scroll lock
- `ui/dialog.tsx` (`ConfirmDialog`) **δεν** κλειδώνει καθόλου το body → το
  περιεχόμενο πίσω από το modal scroll-άρει με το δάχτυλο.
- `ui/sheet.tsx:30-34` κάνει `document.body.style.overflow = ''` στο cleanup
  **χωρίς counter** → με δύο ταυτόχρονα mounted sheets (π.χ.
  `ActiveWorkoutView.tsx`: `AddExerciseSheet` + plate `BottomSheet`), το
  κλείσιμο του ενός ξεκλειδώνει το body ενώ το άλλο είναι ακόμα ανοιχτό.
**Fix:** ένα κοινό `useScrollLock()` με ref-count, χρησιμοποιείται και από τα δύο.

### M-7 · Touch targets στο logging
`AddSetInline.tsx:220,238,258` → `className="h-9 …"` = **36px**. Είναι τα πιο
πατημένα πεδία όλου του app. WCAG 2.5.5 θέλει 44px· το `Button` ήδη το τηρεί
(`ui/button.tsx:31` → `h-11`). Fix: `h-11` σε κινητό, `md:h-9` για πυκνότητα.

### M-8 · `vh` → `dvh`
`ui/sheet.tsx:55` → `max-h-[85vh]`. Στο iOS το `vh` = *large viewport* (με
κρυμμένο URL bar) → με ορατό URL bar το κάτω μέρος του sheet (μαζί με το
κουμπί «Αποθήκευση») πέφτει κάτω από το browser chrome. **Fix:** `max-h-[85dvh]`.

### M-9 / M-10 · Safe area
- `AppShell.tsx:36` → `pb-24` (96px) σταθερό, ενώ το `BottomTabNav` είναι
  `py-2 + icon + label + safe-bottom` — δουλεύει σήμερα, αλλά είναι μαγικός
  αριθμός. Καθαρότερο: `pb-[calc(6rem+env(safe-area-inset-bottom))]` ή CSS var
  με το ύψος του nav.
- `globals.css:135-140` ορίζει μόνο `safe-top`/`safe-bottom`. Σε **landscape σε
  iPhone με notch** το περιεχόμενο μπαίνει κάτω από την εγκοπή — λείπει
  `padding-inline: env(safe-area-inset-left) env(safe-area-inset-right)`.

### M-12 · Manifest
`vite.config.ts`: `orientation: 'portrait'` κλειδώνει και το **desktop/tablet**
install σε portrait. Πρότεινε `'any'` (ή βγάλ' το). Λείπουν επίσης `id`
(σταθερή ταυτότητα εγκατάστασης — αλλιώς αλλαγή `start_url` = «νέο app») και
`scope`.

### M-13 · Το κενό 448–768px
`max-w-md` (448px) → `md:max-w-4xl`. Σε tablet portrait (768px είναι το κατώφλι,
οπότε 600–767px) βλέπεις στενή στήλη με bottom tabs σε μεγάλη οθόνη.
Ένα `sm:max-w-lg` ή αλλαγή του nav breakpoint σε `sm:` το μαλακώνει.

### Τι ΕΙΝΑΙ ήδη σωστό (μην το «διορθώσεις»)
- `viewport-fit=cover` + pinch-zoom ενεργό (`index.html:7-14`) ✅
- `theme-color` **ενημερώνεται δυναμικά** ανά theme (`lib/theme.ts:171-173`) ✅
- `<html lang>` ακολουθεί το i18next (`i18n/index.ts:27-30`) ✅
- `inputMode` σε όλα τα αριθμητικά πεδία ✅
- focus trap σε sheet/dialog/onboarding (`useFocusTrap`) ✅
- `navigator.storage.persist()` στο boot (`main.tsx:31`) ✅
- Το Tauri build κόβει σωστά το PWA/service worker (`vite.config.ts`) ✅

---

# 3. Roadmap §7 — draft προσεγγίσεις

## 3.1 Social login (§7.3) — **φθηνότερο win**

**Κατάσταση:** το Google OAuth είναι **σχεδόν πλήρες, δορμάν**.
- Server: `server/src/oauth.rs` (398 γρ.) — `providers` / `google_start` /
  `google_callback`, CSRF state σε `oauth_states` με 10λεπτη ζωή
  (`migrations/0003_google_oauth.sql`), `accounts.auth_provider` στήλη, scope
  `openid email`, test στο `oauth.rs:380`.
- Routes: `app.rs` → `/api/auth/oauth/providers|google/start|google/callback`.
- Gate: `main.rs` — ενεργό **μόνο** αν υπάρχουν `ANABASIS_GOOGLE_CLIENT_ID` +
  `ANABASIS_GOOGLE_CLIENT_SECRET`. Αλλιώς `google_oauth: None` → 404.
- Client: `lib/api/client.ts` (`googleStart`, `setPendingOAuthToken`,
  `completeOAuthLogin`), `lib/api/auth.ts:134` (fragment cleanup),
  `AccountCard.tsx:68` (`useGoogleOAuthEnabled` → κρύβει το κουμπί αν το
  server λέει όχι), `AccountCard.tsx:144-152` (το κουμπί).

**Άρα λείπει ΜΟΝΟ:** Google Cloud project → OAuth client (Web) → redirect URI
`https://anabasis.axonos.dev/api/auth/oauth/google/callback` → βάλε τα 2 vars
στο `~/.config/aggelos-stack/secrets/anabasis.env` → restart
`anabasis-api.service`. **~30 λεπτά, μηδέν κώδικας.** Πιάσ' το πρώτο.

**Μετά — σειρά προτεραιότητας για τα υπόλοιπα:**
1. **Magic link (email)** — καλύτερο ROI μετά το Google. Χρειάζεται SMTP (ήδη
   ανοιχτό θέμα στο AXON: `secrets/email.env` κενό) + πίνακα
   `login_tokens(token_hash, account_id, expires_at, used_at)`. Το session model
   (opaque tokens σε `sessions`) το σηκώνει ως έχει — απλά μια δεύτερη πόρτα που
   βγάζει το ίδιο token.
2. **Apple Sign-In** — απαιτεί Apple Developer Program (**$99/έτος**) και
   `client_secret` που είναι **JWT υπογεγραμμένο με ES256** και λήγει (max 6
   μήνες) → θέλει rotation. **Έχει νόημα ΜΟΝΟ όταν πας App Store** (§6 του
   CLAUDE.md, Capacitor path). Μέχρι τότε: skip.
3. **Account linking** — μόλις υπάρχουν 2 πάροχοι: ίδιο email με password + με
   Google. Σήμερα το `accounts.email` είναι `UNIQUE`, οπότε το δεύτερο signup θα
   συγκρουστεί. Θέλει είτε merge-on-verified-email είτε πίνακα
   `account_identities(account_id, provider, subject)`. **Απόφαση πριν
   προσθέσεις 2ο πάροχο**, όχι μετά.

⚠️ Πριν από wide sharing: το password του admin είναι build-time γνωστό
(`CLAUDE.md §4`). Άλλαξέ το.

## 3.2 Friends + ranking + «Your Ascent» (§7.4)

### Το αρχιτεκτονικό εμπόδιο (διάβασε ΠΡΩΤΑ)
Το sync είναι **αυστηρά ιδιωτικό**: `sync_rows` έχει `PRIMARY KEY (account_id,
tbl, row_id)` και κάθε query είναι `WHERE account_id = ?`
(`server/src/sync.rs`). Είναι mirror της συσκευής σου, **δεν εκφράζει
κοινόχρηστα δεδομένα**. Άρα:

> **Τα friends/leaderboard ΔΕΝ μπορούν να καβαλήσουν το sync.** Θέλουν νέους
> server πίνακες + νέα REST endpoints. Μην προσθέσεις `friendships` στο
> `ALLOWED_TABLES` — θα ήταν per-account και άρα άχρηστο (και θα άφηνε τον
> client να γράψει «είμαι φίλος με τον Χ» μονομερώς).

### Schema (νέο migration `0004_social.sql`)
```sql
CREATE TABLE profiles (
    account_id   TEXT PRIMARY KEY REFERENCES accounts(id),
    handle       TEXT UNIQUE,              -- @aggelos, opt-in, lowercase
    display_name TEXT,
    visibility   TEXT NOT NULL DEFAULT 'private',  -- private | friends | public
    updated_at   TEXT NOT NULL
);

CREATE TABLE friendships (
    requester_id TEXT NOT NULL REFERENCES accounts(id),
    addressee_id TEXT NOT NULL REFERENCES accounts(id),
    status       TEXT NOT NULL,            -- pending | accepted | blocked
    created_at   TEXT NOT NULL,
    responded_at TEXT,
    PRIMARY KEY (requester_id, addressee_id)
);
CREATE INDEX idx_friend_addressee ON friendships(addressee_id, status);
```
Κανόνας: **μία γραμμή ανά ζευγάρι** (πάντα requester<addressee κανονικοποιημένο,
ή CHECK), αλλιώς θα βρεθείς με διπλά αιτήματα προς κάθε κατεύθυνση.

### Ranking χωρίς να εμπιστεύεσαι τον client
Το XP υπολογίζεται **client-side** σήμερα (`src/lib/gamification.ts:52`,
`XP_PER = {workout:100, set:5, pr:50, skillStep:40}`). Αν ο client «δηλώνει» το
XP του, ο καθένας γράφει ό,τι θέλει.

**Καλά νέα: το server μπορεί να το παράξει μόνο του** από τα `sync_rows`,
χωρίς νέα δεδομένα — τα payloads είναι JSON και το SQLite έχει `json_extract`:
```sql
-- completedWorkouts
SELECT COUNT(*) FROM sync_rows
 WHERE account_id=? AND tbl='workouts' AND deleted=0
   AND json_extract(payload,'$.ended_at') IS NOT NULL
   AND json_extract(payload,'$.deleted_at') IS NULL;
-- prCount → tbl='personal_records' · masteredSteps → tbl='user_skill_step_completions'
```
⚠️ Το `totalSets` είναι το δύσκολο: το `getGamificationInput` μετράει sets που
είναι **non-warmup, non-deleted, ΚΑΙ ανήκουν σε ολοκληρωμένη προπόνηση**
(`queries.ts:695-700`) — δηλαδή join `sets.workout_id → workouts`. Γίνεται με
self-join πάνω στο `sync_rows` + `json_extract`, αλλά είναι το ακριβό κομμάτι.
**Πρόταση:** υλοποίησε το ως ένα **cached `profile_stats`** που ξαναϋπολογίζεται
στο τέλος κάθε `sync::push` (όχι σε κάθε leaderboard read).

⚠️ **Duplication risk:** το `XP_PER`/`TIERS` θα υπάρχει σε TS **και** Rust. Βάλε
comment-σύνδεσμο και στα δύο, και ένα test που τα κλειδώνει (π.χ. ένα
`XP_MODEL_VERSION` που πρέπει να ταιριάζει).

### Privacy — κανόνες πριν γράψεις γραμμή
- **Default `private`.** Το social είναι **opt-in**, ποτέ opt-out.
- Μοιράζονται **ΜΟΝΟ aggregates**: level, tier, XP, πλήθος προπονήσεων, streak.
  **ΠΟΤΕ** raw sets/βάρη/σωματικό βάρος/bodyfat — αυτά είναι ιατρικά ευαίσθητα.
- `handle` ≠ email. Η αναζήτηση φίλου γίνεται με handle ή με invite link,
  **ποτέ με email lookup** (user enumeration).
- `blocked` status πρέπει να υπάρχει από την **πρώτη** έκδοση, όχι μετά.
- Το leaderboard είναι **ανάμεσα σε φίλους**, όχι global. Global ranking σε app
  με self-reported δεδομένα = θόρυβος.

### «Your Ascent» — τι λείπει σήμερα
Υπάρχει: `AchievementsPage` (XP hero + badges + breakdown), `AltitudeCard`
(dashboard), `gamification.ts` με 5 tiers + 7 badges, και σωστό
«null αντί για ψεύτικο level 1» (`AltitudeCard.tsx:19`). **Καλή βάση.**
Λείπει (σειρά):
1. **Level-up moment** — υπάρχει `RungCelebration` για τα rungs· λείπει το ίδιο
   για level/tier. Το πιο ανταποδοτικό ανά γραμμή κώδικα.
2. **Ιστορικό υψομέτρου** — γράφημα XP στον χρόνο. Έχουμε ήδη ενοποιημένο chart
   (`components/charts/`), οπότε είναι reuse.
3. **Περισσότερα badges + πρόοδος προς το επόμενο** («3/10 προπονήσεις»).
4. **Social overlay** — «ο Χ ανέβηκε στο Alpine» στο feed φίλων. **Τελευταίο**,
   εξαρτάται από τα παραπάνω.

## 3.3 Share link + QR + creator credit (§7.6) — ⚠️ **Η PRIMARY ΤΟ ΧΤΙΖΕΙ ΤΩΡΑ**

**Κατάσταση τη στιγμή που γράφτηκε αυτό (git status):** η primary έχει ήδη
`src/features/profile/components/ShareCard.tsx`, `public/share-qr.svg` και νέο
i18n namespace `share.*` (title/tagline/qrAlt/copy/copied/share/friendsHint/
madeBy). **ΜΗΝ το ξαναχτίσεις.** Καλή απόφαση το προ-παραχθέν στατικό SVG QR
αντί για npm lib: μηδέν bundle cost, δουλεύει offline.

Τι μένει **συμπληρωματικά** (δεν το πιάνει το ShareCard):
- **Σελίδα `/about`** ως μόνιμος προορισμός για το creator credit (portfolio
  `portfolio.axonos.dev` + Instagram + GitHub repo), όχι μόνο κάρτα μέσα στο
  Profile. Job-anchor = θέλει σταθερό, link-άρισιμο URL.
- **Link από το Settings footer** — το `SettingsPage.tsx:370` έχει ήδη τη γραμμή
  «Anabasis · offlineNote»· εκεί ακριβώς κουμπώνει.
- **Web Share API**: αν το ShareCard δεν το χρησιμοποιεί ήδη, `navigator.share`
  δουλεύει σε Android Chrome + iOS Safari **και σε installed PWA**· fallback
  clipboard (pattern υπάρχει ήδη στο `AdminPage.tsx:86`).
- **OG preview**: το `index.html` έχει ήδη πλήρη `og:` tags + `og.png` — να
  δείχνουν στο `/about` όταν υπάρξει.

⚠️ **Πριν μοιραστεί πλατιά:** το link δείχνει στο `anabasis.axonos.dev`, που ζει
στο laptop + tunnel (CLAUDE.md §6). Χωρίς always-on (fly.io free), οι μισοί που
θα πατήσουν το QR θα δουν 502. **Το QR είναι ο λόγος να γίνει το always-on
τώρα, όχι «κάποτε».**

## 3.4 Settings σε επαγγελματικό επίπεδο (§7.7)

**Σήμερα:** `SettingsPage.tsx` = 374 γραμμές, **επίπεδο scroll** με 7 ενότητες:
account (`:79`), library (`:101`), theme (`:124`), accent (`:149`), language
(`:206`), restTimer (`:226`), units (`:304`), yourData (`:324`).

**Πρόβλημα #1 — δύο «ταυτότητες» χωρίς σχέση:**
- `SettingsPage` → `AccountCard` = **cloud λογαριασμός** (email/sync/admin)
- `ProfilePage` (`/profile`, μέσα στο «Περισσότερα») = **τοπικά προφίλ
  συσκευής** (πολλαπλοί χρήστες στο ίδιο κινητό, `profile.deviceOnly`)

Δύο διαφορετικά πράγματα με σχεδόν ίδιο όνομα, σε δύο διαφορετικά σημεία. Ο
χρήστης δεν έχει τρόπο να καταλάβει τη διαφορά. **Αυτό είναι το πρώτο που
πρέπει να λύσει το redesign**, όχι τα χρώματα.

**Πρόταση δομής** — Settings γίνεται **hub** με υπο-σελίδες (κερδίζει και από
το AppBar/back του §1):
```
/settings                  hub: λίστα ομάδων + ταυτότητα στην κορυφή
  /settings/account        cloud λογ/σμός, sync status, αλλαγή password, logout
  /settings/profiles       τοπικά προφίλ (μετακόμιση του ProfilePage) + ΕΞΗΓΗΣΗ
  /settings/appearance     theme, accent, γλώσσα
  /settings/training       rest timer, μονάδες, βιβλιοθήκη (ασκήσεις/δραστ./skills)
  /settings/data           export/import, storage usage, εκκαθάριση
  /settings/privacy        (ΝΕΟ, όταν έρθει το social) ορατότητα, handle, blocks
  /settings/about          creator credit, share, έκδοση, licenses, GitHub
```
Κρατά την υπάρχουσα `<SectionTitle>` γλώσσα· απλά σπάει το scroll. Κάθε
υπο-σελίδα είναι μικρή → εύκολο διάβασμα, εύκολο test, και μπαίνει σταδιακά.

**Λοιπά που λείπουν και φαίνονται «pro»:** έκδοση + build hash στο footer ·
storage usage (`navigator.storage.estimate()`) · «τι συγχρονίζεται» explainer ·
danger zone με διπλή επιβεβαίωση για διαγραφή δεδομένων.

## 3.5 Admin σε pro επίπεδο (§7.8)

**Σήμερα** (`AdminPage.tsx`, 198 γρ.): users table + 4 stats + disable/enable +
reset password. Οι guards (self-disable, last-admin) **έγιναν** — `admin.rs:71-80`.

**Επιβεβαιωμένα κενά:**
- **`AdminPage.tsx:122` → `{(users ?? []).map(…)}`** — δεν υπάρχει **ούτε
  loading ούτε empty state**. Όσο φορτώνει, βλέπεις πίνακα με headers και κενό
  σώμα· με 0 χρήστες βλέπεις **ακριβώς το ίδιο**. (Το `CLAUDE.md §7.8` το είχε
  ήδη σημειώσει ως «όχι blank» — ισχύει ακόμα.) Skeleton rows + «κανένας
  λογαριασμός ακόμα» + διακριτό `loadError` (υπάρχει, `:106`).
- **Πίνακας σε κινητό** (M-11): `overflow-x-auto` με 7 στήλες, χωρίς ένδειξη
  ότι scroll-άρει. Σε <768px κάν' το **λίστα από κάρτες**, όχι πίνακα.
- **Χωρίς pagination/αναζήτηση** — μια χαρά στα 5 άτομα, σπάει στα 100.
- **Χωρίς GC για tombstones** — το `CLAUDE.md §6` το προβλέπει: τα διαγραμμένα
  `sync_rows` μένουν για πάντα. Θέλει job + per-account quota. Το
  `admin::stats` ήδη δείχνει `rows` και `db_size_bytes`, οπότε το σήμα υπάρχει.
- **Χωρίς audit trail** — ποιος admin απενεργοποίησε ποιον και πότε.
- **Sessions**: υπάρχει πίνακας `sessions` αλλά καμία admin όψη
  (ενεργές συνεδρίες / revoke). Το «opaque tokens ΓΙΑ revocation» (§2 CLAUDE.md)
  δεν έχει ακόμα UI που να το αξιοποιεί.

**Σειρά:** loading/empty states (10′) → mobile cards → sessions+revoke →
search/pagination → GC/quota → audit log.

---

# 4. Τι ΔΕΝ έκανα / ανοιχτά

- **Καμία αλλαγή κώδικα.** Μόνο αυτό το αρχείο. Coord lane δηλωμένο:
  `aj coord` → `[claude] anabasis-partner … Writes ONLY docs/ROADMAP-NOTES.md`.
- **Δεν έτρεξα build/tests** (θα χτυπούσαν το `dist/` της primary).
- **Δεν δοκίμασα σε πραγματικό κινητό.** Όλα τα §2 findings είναι από τον
  κώδικα· τα iOS-zoom / pull-to-refresh / safe-area θέλουν επιβεβαίωση σε
  συσκευή. **Ερώτηση για τον Aggelos:** ποια ήταν *τα δικά σου* mobile issues
  (§7.1); Ίσως δεν είναι αυτά — η λίστα εδώ είναι «τι βρίσκει ο κώδικας», όχι
  «τι σε ενόχλησε».
- **`program_days` δεν συγχρονίζονται** — επιβεβαιωμένο ξανά: λείπουν και από
  το client `DIRECT_OWNER_TABLES` (`sync/index.ts:108-113`) και από το server
  `ALLOWED_TABLES` (`sync.rs:16-34`). Ό,τι κτίσεις με programs, να το ξέρεις.
- **Ανοιχτή απόφαση πριν το social:** account linking (§3.1.3). Αν μπει 2ος
  πάροχος χωρίς αυτό, θα χρειαστεί migration με πραγματικούς χρήστες μέσα.
