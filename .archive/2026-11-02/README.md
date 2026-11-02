# Anabasis archive — 2026-11-02

Historical/obsolete material moved out of the active tree during the brand/UX cleanup.
Nothing here is imported by the app build.

| Path | Why archived |
|---|---|
| `src/features/workout/WorkoutPage.tsx` | Legacy `/workout` page; route redirects to `/calendar`. |
| `src/features/workout/components/LastWorkoutCard.tsx` | Only used by the legacy WorkoutPage. |
| `src/components/SkillIcon.tsx` | Replaced by `SkillMark` initials tiles. |
| `src/components/LogoVariants.tsx` | Old v1/v2/v3 logo explorations; active brand is Ascent A only. |
| `scripts/shots.mjs` | Old dark-theme `/workout` screenshot script; replaced by `scripts/screenshots/generate.mjs`. |
| `public/icons.svg` | Initial-scaffold social icon sprite; unused. |
| `branding/AI-PROMPT.md`, `branding/LOGO-BRIEF.md` | Old ocean-blue/staircase logo briefs. |
| `branding/references/current-logo.svg` | Old v1 staircase mark; active mark is `branding/logo-v2/mark.svg`. |
| `docs/screenshots/landing.png`, `landing-1440.png` | Old dark landing captures; current landing is light. |
| `docs/ROADMAP-NOTES.md`, `docs/STATE-MINDMAP.md`, `docs/DESIGN-POLISH-BRIEF.md` | Old planning/status/design snapshots. |
| `docs/planning/*` | August 2026 plans, including outdated Supabase direction. |
| `public/landing/*.png` | Duplicated screenshots; landing now uses `public/screenshots/mobile-*.png`. |

Build artifacts `dist-tauri/`, `.playwright-cli/`, and `output/` were moved to
`~/.archive/anabasis/2026-11-02/` (outside git) to keep the repo clean.
