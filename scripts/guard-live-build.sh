#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVE="$ROOT/dist"

if [ -L "$LIVE" ]; then
  echo "build: refusing to overwrite the live dist symlink." >&2
  echo "build: use 'npm run build:staged' and then 'npm run deploy:promote'." >&2
  exit 1
fi
