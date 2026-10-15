#!/usr/bin/env bash
# Atomic promotion ενός ελεγμένου staged build σε live dist/.
#
# Γιατί υπάρχει: το `serve.py` σερβίρει ΚΑΤΕΥΘΕΙΑΝ το dist/, οπότε ένα σκέτο
# `npm run build` ΔΗΜΟΣΙΕΥΕΙ αμέσως ό,τι χτίζεις — το verification δενόταν με το
# deploy. Η σωστή ροή: `npm run build:staged` (→ dist-staging/), έλεγχος εκεί, και
# ΜΕΤΑ προαγωγή με αυτό το script. Η εναλλαγή γίνεται με rename (atomic στο ίδιο
# filesystem): κάθε request του serve.py βλέπει είτε την παλιά είτε τη νέα έκδοση.
# Κρατά την προηγούμενη έκδοση σε dist-prev/ για άμεσο rollback.
#
# ΔΕΝ κάνει restart/push/deploy πέρα από την εναλλαγή φακέλου — το serve.py
# διαβάζει το dist/ ανά request, οπότε δεν χρειάζεται restart.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGING="$ROOT/dist-staging"
LIVE="$ROOT/dist"
PREV="$ROOT/dist-prev"

if [ ! -d "$STAGING" ]; then
  echo "promote: λείπει το $STAGING — τρέξε πρώτα: npm run build:staged" >&2
  exit 1
fi
if [ ! -f "$STAGING/index.html" ]; then
  echo "promote: το $STAGING δεν μοιάζει έγκυρο build (χωρίς index.html)" >&2
  exit 1
fi

# Καθάρισε τυχόν προηγούμενο backup (κρατάμε ΜΟΝΟ την αμέσως προηγούμενη έκδοση).
rm -rf "$PREV"

# Rename #1: η τρέχουσα live έκδοση → backup (atomic). Αν δεν υπάρχει live, skip.
if [ -d "$LIVE" ]; then
  mv "$LIVE" "$PREV"
fi

# Rename #2: το ελεγμένο staging → live (atomic).
mv "$STAGING" "$LIVE"

echo "promote: dist-staging → dist (προηγούμενη έκδοση στο dist-prev/)."
echo "rollback: npm run deploy:rollback"
