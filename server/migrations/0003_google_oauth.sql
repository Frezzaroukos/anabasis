-- Google OAuth: πώς δημιουργήθηκε ο λογαριασμός + short-lived CSRF state store
-- για τη start→callback διαδρομή (server/API-CONTRACT.md δεν αλλάζει — dormant
-- μέχρι να οριστούν τα ANABASIS_GOOGLE_* env vars).

ALTER TABLE accounts ADD COLUMN auth_provider TEXT;

CREATE TABLE oauth_states (
    state      TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
