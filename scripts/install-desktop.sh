#!/usr/bin/env bash
# Εγκατάσταση του Anabasis ως native desktop app (Tauri) για τον τρέχοντα χρήστη.
# Προϋπόθεση: `npm run tauri build -- --no-bundle` έχει τρέξει (binary στο target/release).
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BIN_SRC="$REPO/src-tauri/target/release/anabasis"
BIN_DST="$HOME/.local/bin/anabasis"
ICON_DIR="$HOME/.local/share/icons/hicolor"
APPS_DIR="$HOME/.local/share/applications"

[[ -x "$BIN_SRC" ]] || { echo "❌ Δεν βρέθηκε binary: $BIN_SRC — τρέξε πρώτα: npm run tauri build -- --no-bundle"; exit 1; }

install -Dm755 "$BIN_SRC" "$BIN_DST"

for entry in "32:32x32.png" "64:64x64.png" "128:128x128.png" "256:128x128@2x.png" "512:icon.png"; do
  size="${entry%%:*}"
  src="${entry#*:}"
  install -Dm644 "$REPO/src-tauri/icons/$src" "$ICON_DIR/${size}x${size}/apps/anabasis.png"
done

# Κύριο entry: το native app.
cat > "$APPS_DIR/anabasis.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Anabasis
GenericName=Calisthenics Tracker
Comment=Weighted calisthenics & skill progression tracker
Exec=$BIN_DST
Icon=anabasis
Terminal=false
Categories=Utility;Sports;
StartupWMClass=anabasis
Keywords=fitness;calisthenics;workout;training;skills;
EOF

# Καθάρισε το παλιό Brave web-wrapper entry (:8120): μπέρδευε τον launcher
# (Mod+D «anabasis» → άνοιγε το web wrapper με stale service-worker cache και
# «έδειχνε παλιά έκδοση»). Το native είναι η μόνη είσοδος πλέον.
rm -f "$APPS_DIR/anabasis-web.desktop"

command -v update-desktop-database >/dev/null && update-desktop-database "$APPS_DIR" || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -f -t "$ICON_DIR" >/dev/null 2>&1 || true
echo "✅ Εγκαταστάθηκε: $BIN_DST + anabasis.desktop + hicolor icons (native, μόνο αυτό)"
