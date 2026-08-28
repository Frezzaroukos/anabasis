# Anabasis Design v2 — «Altitude Violet»

Πλήρες visual redesign (2026-08-28). Πηγή: design research (fitness premium
patterns 2026) + απόφαση κατεύθυνσης. Αντικαθιστά το χρυσό-χάλκινο v1.

## Ταυτότητα

Μεταφορά: **ανάβαση σε υψόμετρο** — σούρουπο/aurora στην κορυφή, όχι ιδρώτας/φωτιά.
Το μωβ είναι το ΜΟΝΟ premium χρώμα που δεν χρησιμοποιεί κανείς στο fitness
(όλοι: κόκκινο/πορτοκαλί/μπλε/πράσινο) → διαφοροποίηση.

## Tokens (dark-first)

```
bg-base      #0C0A14   /* near-black με μωβ χροιά — ΟΧΙ pure black (halation) */
bg-surface   #15121F   /* κάρτες */
bg-elevated  #1E1A2C   /* hover/ανυψωμένα */
text-primary   #F3F1F8
text-secondary #A8A2BC
text-tertiary  #6B6480
accent         #9D5CFF  /* electric amethyst — signature */
accent-glow    #B88CFF
success #4ADE80 · warning #FBBF24 · danger #FB7185   /* πιο ξεθωριασμένα από το accent */
```

Light mode: βάση `#FCFBFA`/`#F7F6F5`, accent σκουρότερο ~12% (`#8A48F0`),
ίδια ιεραρχία. Το **accent picker παραμένει** (7 επιλογές) — το violet γίνεται
το νέο default («Aurora»)· τα υπόλοιπα accents επαναβαθμονομούνται στο νέο σύστημα.

## Βάθος & επιφάνειες

- **Borderless κάρτες**: ύψος = διαφορά φωτεινότητας (base→surface→elevated),
  ΟΧΙ borders/σκιές. Το `border-border` μοτίβο αντικαθίσταται συστηματικά.
- Ένα λεπτό top-highlight (inset 1px, λευκό 4%) στα elevated στοιχεία.

## Τυπογραφία (verified ελληνικά — τα «trendy» Oswald/Bebas/Space Grotesk ΔΕΝ έχουν)

- **Fira Sans Condensed** (@fontsource/fira-sans-condensed, weights 500/600/700):
  headlines, section titles, μεγάλα νούμερα hero. Athletic condensed.
- **Manrope Variable** (@fontsource-variable/manrope): body/UI.
- **JetBrains Mono Variable** (@fontsource-variable/jetbrains-mono):
  ΟΛΑ τα tabular στατιστικά/timers/βάρη — `font-variant-numeric: tabular-nums`.
- Σκάλα: hero metric 44-56px condensed 600 · page title 24px condensed 600 ·
  card title 15px 600 · body 14px · secondary 13px · micro 11px.

## Motion (σφιχτό λεξιλόγιο, ΟΧΙ φιέστα)

- Διάρκειες 200–500ms, spring-like easing: `cubic-bezier(0.22, 1.2, 0.36, 1)`
  (ελαφρύ overshoot) για enter/toggle· `ease-out` για exit. Χωρίς νέα deps —
  CSS + μικρά hand-rolled hooks.
- **Number ticker**: count-up hook για hero αριθμούς dashboard/PR (300-500ms).
- **Δύο επίπεδα celebration**:
  - micro: κάθε commit σετ → 300ms burst από το ίδιο το στοιχείο (το υπάρχον
    set-commit keyframe αναβαθμίζεται με accent glow).
  - macro: PR / ολοκλήρωση skill-σκαλιού → το υπάρχον PR celebration γίνεται
    «ανέβασμα σκαλιού»: το mark (rung-peak) γεμίζει rung-rung + particles
    (hand-rolled canvas, όχι βιβλιοθήκη).
- `prefers-reduced-motion`: όλα πίσω σε απλά fades (υπάρχει ήδη pattern).

## Charts

- Λεπτή γραμμή 1.5-2px στο accent + gradient area fill (accent 18% → διάφανο).
- Soft glow στο active point (blur 8-12px ίδιας απόχρωσης).
- Ring progress για goals/συνέπεια με accent gradient stroke.
- ΕΝΑ accent ανά chart· semantic χρώματα μόνο για status. Recharts μένει.

## Logo

`branding/logo-v2/mark.svg` (gradient) + `mark-mono.svg` (currentColor):
4 rungs σε σιλουέτα κορυφής (σκάλα↔βουνό). Αντικαθιστά public/logo.svg,
favicon, PWA icons, OG, Tauri icons — μέσω `scripts/gen-brand-assets.mjs`
(προσαρμογή στο νέο mark + palette) και `npx tauri icon`.

## Πληροφοριακή αρχιτεκτονική (redesign, όχι refactor λογικής)

- Dashboard: hero = ΕΝΑ μεγάλο νούμερο/κατάσταση ημέρας (WHOOP-style
  «διαβάζεται από απόσταση») πάνω από τα tiles· τα tiles γίνονται borderless.
- «Κουτί-σε-κουτί» πρόβλημα (γνωστό feedback): flatten — sections με
  τυπογραφική ιεραρχία αντί για nested κάρτες.
- Post-workout: summary card «τι άλλαξε» (όγκος vs μ.ό., PRs, νέο σκαλί) —
  υπάρχει ήδη InsightsCard λογική, ανεβαίνει στο τέλος προπόνησης.
- Onboarding/auth/admin: ίδια γλώσσα με το νέο σύστημα.

## Κανόνες υλοποίησης

- Όλα μέσω CSS variables στο globals.css + tailwind.config.ts — ΟΧΙ hardcoded hex
  σε components (μόνο tokens).
- Κάθε αλλαγή περνά `npx tsc -b --noEmit` + υπάρχοντα tests.
- Verify: screenshot κάθε βασικής σελίδας (dark+light) πριν κλείσει το wave.
