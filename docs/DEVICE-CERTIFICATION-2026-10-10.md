# Device Certification — Anabasis UI/UX (2026-10-10)

> Lane **UXA** · branch `ux-devices-2026-10` · base `71fd44c`
> Στόχος: κάθε interactive στοιχείο ≥44×44 σε συσκευές αφής, κάθε κείμενο ≥12px,
> μηδέν horizontal overflow / console errors — σε κινητό, tablet και desktop.
> Εργαλείο μέτρησης: `device-check <url> <paths> [--json] [--shots]` (10 device
> profiles, WCAG 2.5.5 touch-target έλεγχος + font-size <12px + overflow + errors).

## Αποτέλεσμα

**Certification run: `device-check` σε 17 routes × 10 device profiles = 170/170 PASS.**

| Μετρική | Baseline | Μετά |
|---|---|---|
| Touch targets <44px (`/`, Σ 10 devices) | 71 | **0** |
| Text <12px (`/`, Σ 10 devices) | 100 | **0** |
| Touch targets <44px (`/landing.html`, Σ 10) | 42 | **0** |
| Text <12px (`/landing.html`, Σ 10) | 30 | **0** |
| Horizontal overflow (όλα τα routes) | 0 | **0** |
| Page / console errors, 4xx | 0 | **0** |
| **Fails (✗) σε 17 routes × 10 devices** | — | **0** |
| **Small/tiny warnings (△) στα certified routes** | — | **0** |

Το baseline μετρήθηκε μόνο σε `/` + `/landing.html`
(`~/.local/state/strateigeio/device-reports/anabasis-2026-10-10.json`). Η
πιστοποίηση επεκτάθηκε σε όλες τις βασικές ροές — καμία τεκμηριωμένη εξαίρεση δεν
χρειάστηκε (φτάσαμε 0 παντού, συμπεριλαμβανομένου του δύσκολου month-grid στα 375px).

Certified routes: `/ · /calendar · /programs · /progress · /goals · /exercises ·
/skills · /history · /body · /settings · /settings/profiles · /settings/data ·
/settings/appearance · /settings/account · /achievements · /import · /landing.html`

Device profiles: iPhone SE (375), iPhone 13 (390), iPhone 15 Pro Max (430),
Pixel 7 (412), Galaxy Tab S7 portrait (800), iPad Air (820), Galaxy Tab S7
landscape (1280), Laptop 1366, Desktop 1440, Desktop 1920. Επιπλέον spot-check σε
**phone landscape (667×375)**: 0 overflow, 0 small targets.

## Η λύση — ο `tap:` variant

Η εμπειρική μέτρηση έδειξε ότι **κανένα μεμονωμένο media query δεν πιάνει όλες τις
συσκευές αφής** στα device-check profiles:

| Συσκευή | `pointer: coarse` | `max-width: 1099px` |
|---|---|---|
| Τηλέφωνα (375–430) | ✗ (αναφέρουν `fine`) | ✓ |
| Tablets (800–1280) | ✓ | ✗ (το 1280 είναι >1099) |
| Laptop/Desktop (≥1366) | ✗ | ✗ |

Γι' αυτό ορίστηκε στο `tailwind.config.ts` ένας variant που καλύπτει και τα δύο
μέτωπα, αφήνοντας το desktop (ποντίκι, ≥1100px) **ανέγγιχτο** ώστε να μη χαλάσει η
πυκνότητα:

```ts
addVariant('tap', ['@media (max-width: 1099px)', '@media (pointer: coarse)']);
```

Χρήση: `tap:min-h-11 tap:min-w-11` → 44px μόνο σε συσκευές αφής.

## Αλλαγές — πριν / μετά

### 1. Touch targets ≥44×44 (WCAG 2.5.5)

| Στοιχείο | Αρχείο | Πριν | Μετά (touch) |
|---|---|---|---|
| Button `sm` | `components/ui/button.tsx` | h-9 (36px) | `tap:min-h-11` 44px |
| Input | `components/ui/input.tsx` | h-10 (40px) | `tap:min-h-11` 44px |
| Settings CrossLink | `settings/components/SettingsList.tsx` | ~40px | `tap:min-h-11` |
| SideNav rows (tablet) | `layout/SideNav.tsx` | py-2 (~36px) | `tap:min-h-11` |
| Safety notice «Got it»/«Read more» | `legal/SafetyNotice.tsx` | h-7 (28px) / text-only | `tap:min-h-11` |
| Onboarding «Skip» | `onboarding/OnboardingOverlay.tsx` | sm (36px) | `tap:min-h-11 tap:min-w-11` |
| Week-strip day pills | `dashboard/components/WeekStrip.tsx` | gap-1.5, ~43px @375 | gap-1 + `tap:min-h-11` |
| Dashboard profile avatar | `dashboard/DashboardPage.tsx` | h-8 w-8 (32px) | `tap:min-h-11 tap:min-w-11` |
| Exercises filter chips (All/Mine/Archived) | `exercises/ExercisesPage.tsx` | ~32px, «All» <44 wide | `tap:min-h-11 tap:min-w-11` |
| Progress «← History» back link | `progress/ProgressPage.tsx` | text-only (~16px) | `tap:min-h-11` |
| Body «Save» | `body/BodyPage.tsx` | h-9 (36px) | `tap:min-h-11` |
| Account login/signup tabs | `account/AccountCard.tsx` | ~32px | `tap:min-h-11` |
| Appearance accent swatches | `settings/pages/AppearanceSettingsPage.tsx` | h-10 w-10 (40px) | `tap:min-h-11 tap:min-w-11` |
| Calendar month cells (@375) | `calendar/CalendarPage.tsx` | 42.7px wide | card `max-sm:px-1.5` → 44.4px |
| Landing lang toggle + footer links | `public/landing.html` | ~28px | `@media` touch → 44px |

### 2. Text ≥12px (readability floor)

- `text-[10px]` / `text-[11px]` → `text-xs` (12px), project-wide (token-safe swap).
- Τα 4 `text-[9px]` (week-strip weekday, calendar overflow counter, skill-row
  custom tag, skill-ladder step) → 12px.
- Η ταυτότητα «Carbon» παραμένει: τα uppercase tracked graphite eyebrows
  διαβάζονται ίδια στα 12px. **0 overflow regressions** σε 10 device profiles.

## Verification (όλα πράσινα)

| Έλεγχος | Αποτέλεσμα |
|---|---|
| `npx vitest run` | 486/486 ✓ (71 files) |
| `cargo test` (server, αμετάβλητος) | 59/59 ✓ |
| `tsc -b --noEmit` | clean ✓ |
| `vite build` | ✓ (σε temp outDir, όχι στο live `dist/`) |
| `device-check` × 17 routes × 10 devices | 170/170 PASS, 0 ✗, 0 △ ✓ |
| phone landscape 667×375 (bonus) | 0 overflow, 0 small ✓ |

Οπτικός έλεγχος flows (screenshots iPhone SE / Tab S7 portrait+landscape / 1440):
first-use → dashboard → calendar → exercises → appearance → settings. Το desktop
density διατηρήθηκε (sidebar 36px), τα tablets πήραν 44px rows, τα κινητά 44px
παντού, dark theme καθαρό, καμία επικάλυψη/αποκοπή.

## Ενεργοποίηση (χωρίς deploy/push από το lane)

Καμία αλλαγή σε server/DNS/services. Pure frontend. Για deploy μετά από QA + «ναι»:

```bash
cd ~/code/anabasis
git checkout ux-devices-2026-10         # ή merge στο main
npm run build                           # tsc -b + vite → live dist/ (= publish)
systemctl --user restart anabasis.service
# smoke: device-check https://anabasis.axonos.dev "/,/calendar,/exercises,/settings,/landing.html"
```
