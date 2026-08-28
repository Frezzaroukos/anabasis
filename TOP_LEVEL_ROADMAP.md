# Anabasis → Top-Level: Roadmap & Ειλικρινής Αξιολόγηση

> Τι λείπει για να πάει από «τεχνικά σωστό» σε «κάτι που κάποιος θέλει να χρησιμοποιήσει
> και μια εταιρία σταματά να κοιτάζει». Ανά μέτωπο: εμφάνιση, ποιότητα, branding, δομή, λειτουργίες.

**Κατάσταση σήμερα (ενημέρωση 2026-08-28):** 165+ tests · offline-first PWA ·
schema v9→v10 · **live** στο [anabasis.axonos.dev](https://anabasis.axonos.dev) ·
native desktop app (Tauri 2) από 27/08.
Τεχνικά: πολύ πάνω από junior level. Οπτικά: το design pass (accent picker,
logo, skill icons, motion, onboarding, PR celebration) **έχει προχωρήσει** από
τότε που γράφτηκε αυτό το roadmap — οι πίνακες παρακάτω μένουν ως ιστορικό
backlog, δες `VISION-NEXT.md` για τι έχει προσγειωθεί συγκεκριμένα.

---

## Η μία αλήθεια που ορίζει τις προτεραιότητες

**Το app είναι τεχνικά εξαιρετικό και οπτικά ανύπαρκτο.**

Απόδειξη μέσα στον κώδικα:
- Το χρωματικό σύστημα είναι **shadcn defaults** — `--primary` = σχεδόν μαύρο/λευκό. Μηδέν brand χρώμα.
- Υπάρχει καθαρό `logo.svg` (κλιμακωτή γραμμή = ανάβαση) που **δεν χρησιμοποιείται σε ΚΑΜΙΑ οθόνη**.
- Μηδέν κίνηση, μηδέν microinteraction, μηδέν onboarding.

Ένας recruiter ή χρήστης κρίνει σε **5 δευτερόλεπτα** — και αυτά τα δευτερόλεπτα είναι 100% οπτικά.
Ο καθαρός κώδικας φαίνεται στο δεύτερο λεπτό, αν φτάσει ποτέ εκεί. **Η μόχλευση δεν είναι κι άλλα
features — είναι design pass + απόδειξη ότι το χρησιμοποιείς εσύ.**

---

## 🎨 1. Εμφάνιση (το #1 gap)

| Τι λείπει | Γιατί μετράει | Effort |
|---|---|---|
| **Signature accent** (χαλκός→χρυσό «άνοδος») αντί για monochrome | Ένα χρώμα που λέει «αυτό είναι Anabasis», χρησιμοποιημένο ΜΟΝΟ σε επίτευξη (PR, mastery) | S |
| **Επιλεγμένη τυπογραφία** (variable sans + `tabular-nums` σε ΚΑΘΕ αριθμό) | Τα βάρη σε στήλη πρέπει να ευθυγραμμίζονται· system font = «wireframe» | S |
| **Microinteractions** — το σετ κουμπώνει (150ms), το PR πάλλεται μία φορά (400ms) | Επιβεβαίωση, όχι διακόσμηση. Κάνει το app να «απαντά» | M |
| **Empty states με νόημα** αντί για κενές λίστες | Πρώτο άνοιγμα = κενό = «σπασμένο» στο μυαλό του χρήστη | S |
| **Consistent spacing/elevation scale** | Τώρα κάθε section λίγο διαφορετικό· ένα σύστημα = «σχεδιασμένο» | M |
| `prefers-reduced-motion` σε κάθε κίνηση | Προσβασιμότητα, όχι προαιρετικό | S |

## 🏷️ 2. Branding

| Τι λείπει | Γιατί μετράει | Effort |
|---|---|---|
| **Το logo στο UI** (header, splash, PWA) — υπάρχει, δεν μπαίνει πουθενά | Κάθε οθόνη πρέπει να ξέρει ότι είναι Anabasis | S |
| **8 skill icons** (front lever, planche, handstand… ως σιλουέτες) | **Το διαφοροποιητικό.** Καμία icon library δεν τα έχει — φθηνότερο-ανά-εντύπωση κομμάτι | M |
| **OG image + social preview** (1280×640) | Όταν κάποιος μοιράζεται το link, τι βλέπει; Τώρα: τίποτα | S |
| **Onboarding 3-οθονών** — τι είναι το skill tree, γιατί όχι Hevy | Ο επισκέπτης δεν καταλαβαίνει την αξία σε 5΄ χωρίς αφήγηση | M |
| **Ελληνικό στοιχείο** (Ἀνάβασις, μυθολογικό μοτίβο) διακριτικά | Ξεχωρίζει από τα 100 αγγλόφωνα gym apps· ταιριάζει με το AXON ethos | S |

## ✅ 3. Ποιότητα

| Τι λείπει | Γιατί μετράει | Effort |
|---|---|---|
| **🔴 Μία πραγματική προπόνηση με αυτό** | Το #1 ρίσκο — δεν λύνεται με κώδικα. Θα βρεις ροές που ενοχλούν μόνο ιδρωμένος στο γυμναστήριο | — |
| **1 e2e test** (ξεκίνα→άσκηση→3 σετ dropset→PR→τέλος) | Αποδεικνύει ότι η κρίσιμη ροή δουλεύει end-to-end | M |
| **Accessibility pass** (contrast ratios, focus rings, ARIA, screen reader) | Ένας senior το τσεκάρει σε review· είναι σήμα ωριμότητας | M |
| **Έλεγχος skill targets** (τα seed values τα έγραψα εγώ — είναι σωστά;) | Αν κάποιος τα ακολουθήσει και είναι λάθος, το app λέει ψέματα | S |
| **Lighthouse score** στο README (perf/a11y/PWA) | Μετρήσιμη απόδειξη ποιότητας | S |
| **Error boundary** ανά route | Ένα crash δεν πρέπει να ρίχνει όλο το app | S |

## 🏗️ 4. Δομή

| Τι λείπει | Γιατί μετράει | Effort |
|---|---|---|
| **Cross-device sync** (Supabase) | «full across devices» — το ρητό αίτημα. Το data layer είναι ήδη έτοιμο (updated_at παντού) | L |
| **Ιεράρχηση 15 σελίδων** — κίνδυνος sprawl | Ο χρήστης χρησιμοποιεί 3-4· οι υπόλοιπες πρέπει να δικαιολογούνται | M |
| **Design token system** (documented) αντί για ad-hoc Tailwind | Ένα source of truth για χρώμα/spacing/type = συνέπεια + εύκολο rebrand | M |
| **CONTRIBUTING.md + CI badge** | Repo hygiene που ο recruiter προσέχει | S |

## ⚙️ 5. Λειτουργίες (level-up, όχι bloat)

| Πρόταση | Persona | Effort |
|---|---|---|
| **Plate calculator** (barbell + πλάκες δίπλα) — ήταν στο αρχικό scope, δεν έγινε | serious/elite | S |
| **Auto-progression suggestion** (RPE-based: «πρόσθεσε 2.5kg») | serious | M |
| **Goal setting με deadline** (67→75kg lean — υπάρχει ήδη στο Fitness-TODO.md) | όλοι | M |
| **Rest / deload awareness** («3η εβδομάδα ανεβαίνει ο όγκος — deload;») | serious/elite | M |
| **Superset/dropset στο ίδιο workout ΓΡΗΓΟΡΑ** (ήδη υπάρχει, αλλά UX polish) | elite | S |
| **Widget/quick-log** από home screen (PWA share target) | casual | M |
| **Σύνδεση με τις 916 BioHuman σημειώσεις** (το moat σου — κανείς άλλος δεν το έχει) | εσύ | L |

---

## 🎯 Η άποψή μου — τι θα έκανα ΕΓΩ, με σειρά

**Το «top-level» ΔΕΝ είναι 20 ακόμα features.** Είναι τρία πράγματα:

1. **Design pass** (Εμφάνιση + Branding) — η μεγαλύτερη μόχλευση με τη λιγότερη δουλειά.
   Signature accent + logo στο UI + skill icons + microinteractions + onboarding.
   Αυτό μετατρέπει «άλλο ένα CRUD» σε «κάτι που σχεδιάστηκε». **~1 εστιασμένη φάση.**

2. **Μία πραγματική προπόνηση** — χρησιμοποίησέ το εσύ, αύριο, στο γυμναστήριο.
   Κράτα σημειώσεις τι σε ενόχλησε. **Καμία άλλη πληροφορία δεν αξίζει τόσο** — και κανένα
   agent δεν μπορεί να μου τη δώσει. Θα αποκαλύψει 5-10 πραγματικά προβλήματα ροής.

3. **Cross-device sync** (Supabase) — μόνο ΑΦΟΥ το app αξίζει να συγχρονιστεί.
   Το «full across devices» που ζήτησες. Το data layer είναι έτοιμο.

**Τι ΔΕΝ θα έκανα τώρα:** κι άλλα features. Το app έχει ήδη περισσότερα από όσα θα
χρησιμοποιήσει ο μέσος χρήστης. Προσθήκη features πριν το design pass = γυαλίζεις
ένα αμάξι που δεν έχει βαφή.

**Η σκληρή αλήθεια για το career:** το `panargus-advanced` κάθεται έτοιμο και private.
Το Anabasis χρειάζεται ακόμα design pass + deploy για να είναι public-worthy. Αν το deadline
(24 Οκτ) πιέζει, το panargus είναι το γρήγορο win (gitleaks → public), και το Anabasis το
«masterpiece» που παίρνει τον χρόνο του. Και τα δύο, με σειρά. **Πρώτα όμως: rotate το
διαρρεύσαν GitHub PAT** — δεν γίνεται public repo με ζωντανό admin token.

---

## Πρακτική επόμενη κίνηση

Το κομμάτι με τη μεγαλύτερη απόδοση αυτή τη στιγμή είναι το **design pass**. Είναι και το
πιο ορατό στο βιογραφικό. Αν πεις «ναι», ξεκινώ από:
1. Χρωματικό σύστημα (accent «ανόδου») + τυπογραφία + tabular-nums
2. Logo στο UI + 8 skill icons
3. Microinteractions (PR pulse, set commit) + onboarding
4. Design review loop (render → screenshot → κριτική → apply)
