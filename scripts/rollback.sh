#!/usr/bin/env bash
# Rollback στην αμέσως προηγούμενη live έκδοση που κράτησε το promote.sh.
#
# Το dist/ είναι σύνδεσμος προς releases/<ts>/ και το dist-prev/ δείχνει στην
# προηγούμενη. Ο rollback κάνει dist → (στόχος του dist-prev) με ΕΝΑ `rename(2)`
# πάνω σε προσωρινό σύνδεσμο (`mv -T`) — ατομικό, χωρίς στιγμή χωρίς dist/ (το
# παλιό έκανε rm + δύο mv → παράθυρο 404). Ο προηγούμενος στόχος του live
# γράφεται πίσω στο dist-prev, ώστε ένα δεύτερο rollback να κάνει redo.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVE="$ROOT/dist"
PREV="$ROOT/dist-prev"

if [ ! -L "$PREV" ]; then
  echo "rollback: δεν υπάρχει $PREV (σύνδεσμος) — τίποτα για επαναφορά." >&2
  exit 1
fi

PREV_TARGET="$(readlink "$PREV")"
if [ -z "$PREV_TARGET" ] || [ ! -d "$ROOT/$PREV_TARGET" ]; then
  echo "rollback: ο στόχος '$PREV_TARGET' του dist-prev λείπει — ακυρώνω." >&2
  exit 1
fi

CUR_TARGET="$(readlink "$LIVE" 2>/dev/null || true)"

# dist → προηγούμενη release (ατομικό ένα rename).
TMP_LINK="$(mktemp -u "$ROOT/.dist.rb.XXXXXX")"
ln -s "$PREV_TARGET" "$TMP_LINK"
mv -T "$TMP_LINK" "$LIVE"

# dist-prev → ό,τι ήταν live (redo), αν υπήρχε έγκυρος σύνδεσμος.
if [ -n "$CUR_TARGET" ]; then
  TMP_PREV="$(mktemp -u "$ROOT/.dist.rb.prev.XXXXXX")"
  ln -s "$CUR_TARGET" "$TMP_PREV"
  mv -T "$TMP_PREV" "$PREV"
fi

echo "rollback: dist → $PREV_TARGET (ατομικό swap)."
