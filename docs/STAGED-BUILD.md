# Staged build & atomic promote

## Το πρόβλημα

Το `anabasis.service` τρέχει το `serve.py`, που σερβίρει **κατευθείαν** τον
φάκελο `dist/`. Άρα ένα σκέτο `npm run build` **δημοσιεύει αμέσως** ό,τι χτίζεις
στο anabasis.axonos.dev — ακόμη κι αν το commit είναι unpushed και το build
ανέλεγκτο. Το verification (tests/typecheck/device-check) ήταν δεμένο με το
deploy: δεν μπορούσες να ελέγξεις ένα artifact χωρίς να το έχεις ήδη ανεβάσει.

## Η ροή

```bash
npm run build:staged      # tsc -b + vite build → dist-staging/ (ΟΧΙ live)
#   → έλεγξε το dist-staging/ (serve σε temp port, device-check, Lighthouse)
npm run deploy:promote    # atomic: dist-staging → dist, η παλιά → dist-prev/
#   → αν κάτι πάει στραβά:
npm run deploy:rollback   # atomic: dist-prev → dist (η κακή → dist-bad/)
```

- `build:staged` γράφει σε `dist-staging/`, ποτέ στο live `dist/`. Ίδιο μοτίβο με
  το ήδη υπάρχον `build:tauri` (→ `dist-tauri/`).
- `deploy:promote` (`scripts/promote.sh`) προάγει το **ελεγμένο** artifact.

## Γιατί είναι ατομικό

Η προαγωγή γίνεται με **δύο `rename(2)`** στο ίδιο filesystem:

1. `dist/` → `dist-prev/` (κρατά την προηγούμενη έκδοση για rollback)
2. `dist-staging/` → `dist/`

Το `rename` είναι ατομική πράξη του πυρήνα: κάθε request του `serve.py` (που
διαβάζει το `dist/` ανά request) βλέπει **είτε** όλη την παλιά **είτε** όλη τη
νέα έκδοση — ποτέ μισο-γραμμένο build. Δεν χρειάζεται restart του service, γιατί
το `serve.py` δεν κρατά το `dist/` σε cache· το ξαναδιαβάζει κάθε φορά.

Το μόνο παράθυρο είναι η στιγμή ανάμεσα στα δύο renames, όπου το `dist/` δεν
υπάρχει για λίγα μικροδευτερόλεπτα (ένα request εκεί → 404). Για χειροκίνητη
προαγωγή είναι αμελητέο· αν χρειαστεί μηδενικό παράθυρο, η εναλλακτική είναι να
γίνει το `dist/` symlink σε `releases/<ts>/` και να εναλλάσσεται ο symlink —
αλλαγή υποδομής που χρειάζεται συντονισμό με το service (δεν γίνεται εδώ).

## Rollback

`deploy:rollback` (`scripts/rollback.sh`) εναλλάσσει `dist-prev/ → dist/` (η κακή
έκδοση πάει στο `dist-bad/`). Κρατιέται **μόνο** η αμέσως προηγούμενη έκδοση.

## Σημ.

Αυτά τα scripts κάνουν **μόνο** εναλλαγή φακέλου — κανένα build/push/DNS/restart.
Η προαγωγή σε live παραμένει ενέργεια με ρητή έγκριση. `dist-staging/`,
`dist-prev/`, `dist-bad/` είναι στο `.gitignore`.
