#!/usr/bin/env python3
"""Anabasis local server.

Σερβίρει το production build. Δύο απαιτήσεις που ένας απλός http.server δεν καλύπτει:
  1) SPA fallback — /skills/<id> πρέπει να δίνει index.html, αλλιώς refresh = 404.
  2) Σωστά headers ώστε το PWA/service-worker να ενημερώνεται (no-cache στο index/sw).

Δένει σε 0.0.0.0 ώστε να είναι προσβάσιμο και από το Tailscale (κινητό/tablet).
"""
from __future__ import annotations
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "dist"
PORT = int(os.environ.get("ANABASIS_PORT", "8120"))
NO_CACHE = {"/", "/index.html", "/sw.js", "/registerSW.js", "/manifest.webmanifest"}


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        if self.path.split("?")[0] in NO_CACHE:
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        else:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        super().end_headers()

    def send_head(self):  # type: ignore[override]
        path = self.translate_path(self.path)
        # SPA fallback: ό,τι δεν είναι υπαρκτό αρχείο και δεν είναι asset → index.html
        if not os.path.exists(path) and "." not in os.path.basename(path):
            self.path = "/index.html"
        return super().send_head()

    def log_message(self, fmt: str, *args) -> None:
        # Κρατά το journal καθαρό — μόνο σφάλματα.
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


def main() -> int:
    if not ROOT.is_dir():
        print(f"dist/ λείπει ({ROOT}) — τρέξε: npm run build", file=sys.stderr)
        return 1
    handler = partial(Handler, directory=str(ROOT))
    with ThreadingHTTPServer(("0.0.0.0", PORT), handler) as srv:
        print(f"Anabasis → http://localhost:{PORT}  (dist: {ROOT})", flush=True)
        srv.serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
