#!/usr/bin/env bash
# Rollback στην αμέσως προηγούμενη live έκδοση που κράτησε το promote.sh.
# Εναλλάσσει dist/ ↔ dist-prev/ με rename (atomic), ώστε μια κακή προαγωγή να
# γυρίζει πίσω σε δευτερόλεπτα χωρίς rebuild. Τρέξε ΜΟΝΟ αν υπάρχει dist-prev/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVE="$ROOT/dist"
PREV="$ROOT/dist-prev"
BAD="$ROOT/dist-bad"

if [ ! -d "$PREV" ]; then
  echo "rollback: δεν υπάρχει $PREV — τίποτα για επαναφορά." >&2
  exit 1
fi

# Βγάλε στην άκρη την (κακή) τρέχουσα, βάλε πίσω την προηγούμενη. Atomic renames.
rm -rf "$BAD"
if [ -d "$LIVE" ]; then
  mv "$LIVE" "$BAD"
fi
mv "$PREV" "$LIVE"

echo "rollback: dist-prev → dist (η ανακληθείσα έκδοση στο dist-bad/)."
