#!/usr/bin/env bash
# Atomic promotion ενός ελεγμένου staged build σε live.
#
# Γιατί υπάρχει: το `serve.py` σερβίρει ΚΑΤΕΥΘΕΙΑΝ το dist/, οπότε ένα σκέτο
# `npm run build` ΔΗΜΟΣΙΕΥΕΙ αμέσως ό,τι χτίζεις — το verification δενόταν με το
# deploy. Η σωστή ροή: `npm run build:staged` (→ dist-staging/), έλεγχος εκεί, και
# ΜΕΤΑ προαγωγή με αυτό το script.
#
# Πώς είναι ατομικό (ΧΩΡΙΣ παράθυρο 404): το `dist/` είναι ΣΥΜΒΟΛΙΚΟΣ ΣΥΝΔΕΣΜΟΣ
# που δείχνει σε `releases/<ts>/`. Η εναλλαγή γίνεται με ΕΝΑ `rename(2)` πάνω σε
# προσωρινό symlink (`mv -T`): το rename αντικαθιστά ατομικά τον παλιό σύνδεσμο
# με τον νέο, οπότε κάθε request του serve.py βλέπει είτε όλη την παλιά είτε όλη
# τη νέα έκδοση — ποτέ απόντα φάκελο. (Το παλιό promote έκανε rm + δύο mv και
# άφηνε μια στιγμή χωρίς dist/ → 404.) Το serve.py ακολουθεί τον σύνδεσμο ανά
# request (ROOT = <repo>/dist), άρα δεν χρειάζεται restart.
#
# ΔΕΝ κάνει restart/push/deploy πέρα από την εναλλαγή του συνδέσμου.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGING="$ROOT/dist-staging"
LIVE="$ROOT/dist"
PREV="$ROOT/dist-prev"
RELEASES="$ROOT/releases"
KEEP=5  # πόσες releases κρατάμε (πέρα από current/prev)

if [ ! -d "$STAGING" ]; then
  echo "promote: λείπει το $STAGING — τρέξε πρώτα: npm run build:staged" >&2
  exit 1
fi
if [ ! -f "$STAGING/index.html" ]; then
  echo "promote: το $STAGING δεν μοιάζει έγκυρο build (χωρίς index.html)" >&2
  exit 1
fi

mkdir -p "$RELEASES"
# Nanosecond suffix → μοναδικό ακόμη κι αν δύο promotes πέσουν στο ίδιο
# δευτερόλεπτο (αλλιώς το mv θα φώλιαζε το staging μέσα σε υπαρκτή release).
TS="$(date +%Y%m%d-%H%M%S-%N)"
NEW_REL="$RELEASES/$TS"

# Το ελεγμένο staging γίνεται αμετάβλητη release (rename, ίδιο filesystem).
mv "$STAGING" "$NEW_REL"

# Τι δείχνει τώρα το live — θα γίνει ο στόχος rollback.
CUR_TARGET=""
if [ -L "$LIVE" ]; then
  CUR_TARGET="$(readlink "$LIVE")"
fi

# Προσωρινός σύνδεσμος δίπλα στο live (ίδιο filesystem) με ΣΧΕΤΙΚΟ στόχο ώστε το
# repo να μετακινείται χωρίς να σπάει ο σύνδεσμος.
TMP_LINK="$(mktemp -u "$ROOT/.dist.new.XXXXXX")"
ln -s "releases/$TS" "$TMP_LINK"

if [ -L "$LIVE" ] || [ ! -e "$LIVE" ]; then
  # Steady state: το dist είναι σύνδεσμος (ή λείπει) → ΕΝΑ rename, πλήρως ατομικό.
  mv -T "$TMP_LINK" "$LIVE"
else
  # Πρώτη μετάβαση: το dist είναι ΚΑΝΟΝΙΚΟΣ φάκελος (legacy). Το POSIX rename ΔΕΝ
  # αντικαθιστά φάκελο με σύνδεσμο, άρα ο φάκελος πρέπει να βγει πρώτα. Τον
  # κρατάμε ως release (ΟΧΙ rm — rollback-able) και κάνουμε το swap στο ελάχιστο
  # δυνατό διάστημα. Μοναδικό, μίας-φοράς· από δω κι εμπρός το dist είναι σύνδεσμος.
  LEGACY="$RELEASES/legacy-$TS"
  mv "$LIVE" "$LEGACY"
  mv -T "$TMP_LINK" "$LIVE"
  CUR_TARGET="releases/legacy-$TS"
fi

# Δείκτης rollback: dist-prev → προηγούμενη release (ατομικά, idempotent).
if [ -n "$CUR_TARGET" ]; then
  TMP_PREV="$(mktemp -u "$ROOT/.dist.prev.XXXXXX")"
  ln -s "$CUR_TARGET" "$TMP_PREV"
  mv -T "$TMP_PREV" "$PREV"
fi

# Κράτα μόνο τις τελευταίες $KEEP releases — ποτέ αυτήν που δείχνει current/prev.
CUR_NOW="$(readlink "$LIVE" 2>/dev/null | xargs -r basename || true)"
PREV_NOW="$(readlink "$PREV" 2>/dev/null | xargs -r basename || true)"
mapfile -t ALL < <(ls -1 "$RELEASES" 2>/dev/null | sort -r)
kept=0
for rel in "${ALL[@]}"; do
  if [ "$rel" = "$CUR_NOW" ] || [ "$rel" = "$PREV_NOW" ]; then continue; fi
  kept=$((kept + 1))
  if [ "$kept" -gt "$KEEP" ]; then
    rm -rf "${RELEASES:?}/${rel:?}"
  fi
done

echo "promote: dist → releases/$TS (ατομικό swap· προηγούμενη στο dist-prev)."
echo "rollback: npm run deploy:rollback"
