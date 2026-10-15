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
npm run deploy:promote    # atomic: dist → releases/<ts>/, σύνδεσμος repointed
#   → αν κάτι πάει στραβά:
npm run deploy:rollback   # atomic: dist → προηγούμενη release (δείκτης dist-prev)
```

- `build:staged` γράφει σε `dist-staging/`, ποτέ στο live `dist/`. Ίδιο μοτίβο με
  το ήδη υπάρχον `build:tauri` (→ `dist-tauri/`).
- `deploy:promote` (`scripts/promote.sh`) προάγει το **ελεγμένο** artifact.

## Γιατί είναι ατομικό (χωρίς παράθυρο 404)

Το `dist/` είναι **συμβολικός σύνδεσμος** προς `releases/<ts>/`. Η προαγωγή:

1. `dist-staging/` → `releases/<ts>/` (rename — το ελεγμένο artifact γίνεται
   αμετάβλητη release).
2. Φτιάχνεται ένας **προσωρινός** σύνδεσμος `releases/<ts>` και μπαίνει στη θέση
   του `dist/` με **ένα** `rename(2)` (`mv -T`).

Το `rename` πάνω σε σύνδεσμο είναι **μία** ατομική πράξη του πυρήνα που
αντικαθιστά τον παλιό σύνδεσμο με τον νέο: κάθε request του `serve.py` (που
ακολουθεί το `dist/` ανά request· `ROOT = <repo>/dist`) βλέπει **είτε** όλη την
παλιά **είτε** όλη τη νέα έκδοση — **ποτέ** απόντα φάκελο. Δεν χρειάζεται restart
του service. Αυτό διορθώνει το παλιό promote (rm + δύο mv) που άφηνε μια στιγμή
χωρίς `dist/` → 404.

**Πρώτη μετάβαση:** αν το `dist/` είναι ακόμη **κανονικός φάκελος** (legacy, πριν
υπάρξει σύνδεσμος), το POSIX `rename` δεν αντικαθιστά φάκελο με σύνδεσμο· ο
φάκελος κρατιέται ως `releases/legacy-<ts>/` (ΟΧΙ διαγραφή — rollback-able) και
το swap γίνεται στο ελάχιστο δυνατό διάστημα. Γίνεται **μία φορά**· από κει κι
εμπρός το `dist/` είναι σύνδεσμος και κάθε promote είναι πλήρως ατομικό.

## Rollback

`deploy:rollback` (`scripts/rollback.sh`) δείχνει το `dist/` πίσω στον στόχο του
`dist-prev` με **ένα** `rename(2)` σε σύνδεσμο — ίδια ατομικότητα, χωρίς παράθυρο.
Ο προηγούμενος στόχος του live γράφεται πίσω στο `dist-prev`, ώστε ένα δεύτερο
rollback να κάνει **redo**.

## Σημ.

Αυτά τα scripts κάνουν **μόνο** εναλλαγή συνδέσμου — κανένα build/push/DNS/restart.
Η προαγωγή σε live παραμένει ενέργεια με ρητή έγκριση. Οι τελευταίες `KEEP=5`
releases κρατιούνται (ποτέ η τρέχουσα/προηγούμενη)· παλιότερες κλαδεύονται.
`dist-staging/`, `dist-prev`, `releases/` είναι στο `.gitignore`.
