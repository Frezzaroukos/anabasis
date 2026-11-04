-- Shareable one-time (or limited) access codes. Only SHA-256 hashes are stored;
-- the plaintext code is shown once to the admin who generated it.
CREATE TABLE comp_codes (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    code_prefix TEXT NOT NULL,
    days INTEGER,
    indefinite INTEGER NOT NULL DEFAULT 0,
    max_uses INTEGER NOT NULL DEFAULT 1,
    uses INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT,
    FOREIGN KEY (created_by) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX comp_codes_active_idx ON comp_codes(code_hash, revoked_at, uses, max_uses);
