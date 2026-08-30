# Anabasis v4 — Calendar-centric restructure (SSOT)

Απόφαση Aggelos (2026-08-30). Στόχος: λιγότερο χάος, αρμονία, τα πάντα δένουν.
Πήχης: top-level vs τα καλύτερα σύγχρονα apps. **Αυτό το αρχείο είναι η πηγή
αλήθειας — κάθε agent το διαβάζει πρώτο.**

## 1. Νέα πλοήγηση (κλειδωμένο)

Tabs: **Home · Calendar · Programs · Exercises · More**
- **Home** — το dashboard που αρέσει στον Aggelos (hero, Recent, Ascent, next-step,
  WeekStrip). ΚΡΑΤΙΕΤΑΙ + βελτιώνεται. ΔΕΝ αντικαθίσταται.
- **Calendar** — το ΚΕΝΤΡΟ. Εδώ γίνεται η καταγραφή προπόνησης.
- **Programs** — «My Programs»: φτιάχνεις ρουτίνες με **μέρες** (Upper/Lower/Push…).
- **Exercises** — βιβλιοθήκη ασκήσεων **μαζί με τα Skills** (οργανωτικό merge).
  Tap άσκηση → η πρόοδός της (charts)· skill → και η «σκάλα».
- **More** — Goals, Body, Achievements, Import, Settings, Profile.

**ΚΑΤΩ η καρτέλα «Workout».** Ο logger ανοίγει ΑΠΟ το Calendar.
**Progress/charts ΔΕΝ είναι tab** — ζει μέσα στην κάθε άσκηση.

## 2. Καταγραφή (logging) — set-by-set, από το Calendar

Ροή:
1. Στο Calendar, tap σε μέρα → «+ Προπόνηση».
2. Διαλέγεις **program-day** (π.χ. «Upper») ΑΠΟ τα My Programs → auto pre-fill των
   ασκήσεων/targets + **auto αρίθμηση** («3η Upper day» = πόσες completed υπάρχουν
   με αυτό το program_day). Ή **ad-hoc/random** (mini/quick/for-fun με φίλους) —
   κενή προπόνηση, προσθέτεις ασκήσεις ελεύθερα.
3. Καταγράφεις **set-by-set με κουμπιά** (ο υπάρχων logger, βελτιωμένος: το form
   δεν κλείνει μετά το save, previous-set reference, rest timer auto-start).
4. Το quick-log («80 5,4,3,2») παραμένει ως προαιρετική γρήγορη είσοδος.

Ο logger ζει σε route `/workout/active` (ΟΧΙ takeover — BottomTabNav μένει, minimize
→ resume bar). Το Home CTA γίνεται «Resume» όταν υπάρχει ενεργή session.

## 3. Data model αλλαγές (schema v12)

**Νέος πίνακας `program_days`** — ένα πρόγραμμα έχει πολλές μέρες:
```
program_days(id, program_id, name, position, created_at, updated_at)
```
Index: `id, program_id, [program_id+position]`.

**`program_exercises`** += `program_day_id: UUID | null` (ανήκει σε μέρα· null =
πρόγραμμα χωρίς ρητές μέρες, μία default μέρα). Index += `program_day_id`.

**`workouts`** += `program_id: UUID | null`, `program_day_id: UUID | null`
(ad-hoc = και τα δύο null). Auto-numbering: count(completed workouts με ίδιο
program_day_id).

**Migration v12 (additive, μη-καταστροφική):**
- Υπάρχοντα program_exercises → `program_day_id ??= null` (single implicit day).
- Υπάρχοντα workouts → `program_id/program_day_id ??= null`.
- ΚΑΝΕΝΑ υπάρχον δεδομένο δεν χάνεται.

**Queries που χρειάζονται (queries.ts):**
- `createProgramDay/renameProgramDay/reorderProgramDays/deleteProgramDay`
- `listProgramDays(programId)`, `getProgramDayWithExercises(dayId)`
- `startWorkoutFromProgramDay(dayId)` → workout με program_id+program_day_id, pre-filled plan
- `startAdHocWorkout(activityKind)` → κενή workout, no program link
- `countProgramDaySessions(dayId)` → για την αρίθμηση («3η Upper day»)
- `listWorkoutsByMonth(year, month)` / `listWorkoutsForDay(date)` → Calendar
- `createProgramFromTemplate` επεκτείνεται: templates με πολλές μέρες (PPL→3 μέρες)

## 4. Skills ↔ Exercises (οργανωτικό merge + εμπλουτισμός)

**ΔΕΝ ισοπεδώνονται.** Το skill σύστημα (skills, skill_steps, user_skill_progress,
η «σκάλα») μένει πλήρες — απλά **στεγάζεται κάτω από το Exercises** και οργανώνεται
καθαρά. Το Exercises tab έχει και τις δύο (ενοποιημένη λίστα ή δύο καθαρά segments·
ο agent κρίνει το πιο top-level). Skill detail = η σκάλα (moat) + progress.

**Εμπλουτισμός δυσκολίας (εντολή Aggelos «βελτίωσε/πρόσθεσε»):** ένα skill ανεβαίνει
με ΠΟΛΛΟΥΣ τρόπους — να υποστηρίζονται ρητά στο μοντέλο του skill_step:
- **leverage** (tuck → advanced tuck → straddle → full) — υπάρχει ως steps.
- **added weight** σε διάφορα σημεία (weighted variation ενός step) — πρόσθεσε
  προαιρετικό `target_weight_kg` / `added_weight` στο skill_step ώστε ένα βήμα να
  μπορεί να είναι «full front lever + 5kg».
- **hold time / reps** ως στόχος (υπάρχει target_value).
Ο agent εντοπίζει τι λείπει και προσθέτει τα πεδία/UI ώστε ο χρήστης να ανεβάζει
δυσκολία «με διάφορους τρόπους».

## 5. Goals wiring (δένουν παντού)

Τα Goals σχετίζονται με:
- **Programs** — στόχος συχνότητας (sessions/week) δένει με program adherence.
- **Exercise progress** — στόχος PR/e1RM/reps/hold σε συγκεκριμένη άσκηση → deep-link
  στο chart της άσκησης.
- **Exercises** — στόχος ανά άσκηση/skill.
Deep-links και προς τις δύο κατευθύνσεις (goal ↔ exercise chart ↔ program).

## 6. Design cleanup («βγάλε βλακείες/αντιεπαγγελματικά»)

Αρχές (Carbon + top-level):
- Καμία off-palette απόχρωση (μόνο mono + gold-for-records). Βέλη για κατεύθυνση.
- Ιεραρχία: hero → today/week → feed. Όχι flat stack ίδιων καρτών.
- Καμία διπλή εμφάνιση ίδιου fact (streak/volume/consistency de-dupe).
- Chart numerals mono tabular. Άξονες/legends διακριτικά.
- Πυκνότητα: 44px min touch targets, καθαρά spacing, όχι «κουτί-σε-κουτί».
- Skeleton loaders (undefined=loading ≠ []=empty).
- Κάθε clickable δείχνει clickable· κάθε dead-end παίρνει cross-link.
- Μηδέν lorem/ψεύτικα δεδομένα (ήδη τηρείται).

## 7. Σειρά εκτέλεσης (waves)

- **W-A (foundation, inline):** schema v12 (program_days + links) + queries +
  migration + tests. ΔΕΝ αγγίζει UI.
- **W-B (structure):** nav change (drop Workout tab) + Calendar rebuild (month/week,
  add-workout από μέρα, program-day picker + ad-hoc) + logger από calendar
  (/workout/active, resume bar). Programs multi-day UI.
- **W-C (merge+enrich):** Exercises+Skills ενοποίηση + skill difficulty enrichment.
  Goals wiring. Progress-inside-exercise.
- **W-D (polish):** design cleanup pass, WeekStrip, hero-never-collapses, skeletons.
- **W-E (outward, ΜΟΝΟ με OK Aggelos):** repo δομή, README/portfolio update, git push.

## 8. Κανόνες για agents

- Διάβασε ΑΥΤΟ + τα σχετικά αρχεία πριν γράψεις. TS strict, Greek WHY-comments.
- Tests για κάθε αλλαγή συμπεριφοράς. tsc + targeted vitest πράσινα πριν report.
- ΜΗΝ αγγίζεις i18n json/routes/nav/άλλο lane — report wiring.
- Carbon tokens, μηδέν off-palette. Μηδέν καταστροφική migration.
