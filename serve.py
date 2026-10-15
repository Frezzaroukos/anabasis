#!/usr/bin/env python3
"""Anabasis local server.

Σερβίρει το production build. Δύο απαιτήσεις που ένας απλός http.server δεν καλύπτει:
  1) SPA fallback — /skills/<id> πρέπει να δίνει index.html, αλλιώς refresh = 404.
  2) Σωστά headers ώστε το PWA/service-worker να ενημερώνεται (no-cache στο index/sw).

Δένει σε 0.0.0.0 ώστε να είναι προσβάσιμο και από το Tailscale (κινητό/tablet).
"""
from __future__ import annotations
import gzip
import io
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "dist"
PORT = int(os.environ.get("ANABASIS_PORT", "8120"))
NO_CACHE = {"/", "/index.html", "/sw.js", "/registerSW.js", "/manifest.webmanifest"}

# Text assets που αξίζει να συμπιεστούν. Τα woff2/png/jpg είναι ήδη συμπιεσμένα.
# Content-Type ρητά — το mimetypes δεν ξέρει .webmanifest, κι ένα λάθος type
# σπάει το PWA ή το module loading.
GZIP_TYPES = {
    ".js": "text/javascript",
    ".css": "text/css",
    ".html": "text/html; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json",
}


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        self.send_header("X-Frame-Options", "DENY")
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
            path = self.translate_path(self.path)

        # Directory request (κυρίως το "/") → το index.html του, όπως θα έκανε κι
        # ο base handler. Χωρίς αυτό το `translate_path("/")` δίνει τον φάκελο,
        # το `isfile` αποτυγχάνει και το ΙΔΙΟ το HTML document (η πιο σημαντική
        # απόκριση) σερβίρεται ασυμπίεστο — ο στόχος του gzip χανόταν ακριβώς εκεί.
        if os.path.isdir(path):
            index = os.path.join(path, "index.html")
            if os.path.isfile(index):
                path = index

        # gzip για text assets όταν ο client το δέχεται. Στην παραγωγή το
        # Cloudflare συμπιέζει ούτως ή άλλως· αυτό κάνει την προέλευση ελαφρύτερη
        # ΚΑΙ ευθυγραμμίζει τα τοπικά Lighthouse με το πώς φτάνουν τα bytes
        # στον χρήστη (αλλιώς ένα unminified 420KB bundle μετριέται ασυμπίεστο).
        ext = os.path.splitext(path)[1].lower()
        accepts_gzip = "gzip" in self.headers.get("Accept-Encoding", "")
        if accepts_gzip and ext in GZIP_TYPES and os.path.isfile(path):
            try:
                with open(path, "rb") as f:
                    body = gzip.compress(f.read(), 6)
            except OSError:
                return super().send_head()
            self.send_response(200)
            self.send_header("Content-Type", GZIP_TYPES[ext])
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
            self.send_header("Content-Length", str(len(body)))
            self.send_header(
                "Last-Modified", self.date_time_string(int(os.stat(path).st_mtime))
            )
            self.end_headers()
            return io.BytesIO(body)

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
