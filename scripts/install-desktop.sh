#!/usr/bin/env bash
# Εγκατάσταση του Anabasis ως native desktop app (Tauri) για τον τρέχοντα χρήστη.
# Προϋπόθεση: `npm run tauri build -- --no-bundle` έχει τρέξει (binary στο target/release).
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BIN_SRC="$REPO/src-tauri/target/release/anabasis"
BIN_DST="$HOME/.local/bin/anabasis"
ICON_SRC="$REPO/src-tauri/icons/icon.png"
ICON_DST="$HOME/.local/share/icons/hicolor/512x512/apps/anabasis.png"
APPS_DIR="$HOME/.local/share/applications"

[[ -x "$BIN_SRC" ]] || { echo "❌ Δεν βρέθηκε binary: $BIN_SRC — τρέξε πρώτα: npm run tauri build -- --no-bundle"; exit 1; }

install -Dm755 "$BIN_SRC" "$BIN_DST"
install -Dm644 "$ICON_SRC" "$ICON_DST"

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
StartupWMClass=Anabasis
Keywords=fitness;calisthenics;workout;training;skills;
EOF

# Fallback entry: το παλιό Brave app-window στο :8120 — εκεί ζουν τα δεδομένα
# πριν τη μετάβαση (Ρυθμίσεις → Εξαγωγή στο web, Εισαγωγή στο native).
cat > "$APPS_DIR/anabasis-web.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Anabasis (Web)
GenericName=Calisthenics Tracker (browser)
Comment=Παλιό web wrapper (:8120) — για export των υπαρχόντων δεδομένων
Exec=brave --app=http://localhost:8120 --class=anabasis-web --name=anabasis-web
Icon=anabasis
Terminal=false
Categories=Utility;Sports;
StartupWMClass=anabasis-web
NoDisplay=false
EOF

command -v update-desktop-database >/dev/null && update-desktop-database "$APPS_DIR" || true
echo "✅ Εγκαταστάθηκε: $BIN_DST + anabasis.desktop (native) + anabasis-web.desktop (fallback)"
