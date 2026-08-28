-- Anabasis API — αρχικό σχήμα (βλ. API-CONTRACT.md §SQLite schema)

CREATE TABLE accounts (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',
    disabled      INTEGER NOT NULL DEFAULT 0,
    failed_logins INTEGER NOT NULL DEFAULT 0,
    locked_until  TEXT,
    last_seq      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    last_sync_at  TEXT
);

CREATE TABLE sessions (
    token_hash   TEXT PRIMARY KEY,
    account_id   TEXT NOT NULL REFERENCES accounts(id),
    created_at   TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    last_used_at TEXT,
    user_agent   TEXT
);

CREATE INDEX idx_sessions_account ON sessions(account_id);

CREATE TABLE sync_rows (
    account_id        TEXT NOT NULL,
    tbl                TEXT NOT NULL,
    row_id             TEXT NOT NULL,
    payload            TEXT NOT NULL,
    seq                INTEGER NOT NULL,
    deleted            INTEGER NOT NULL DEFAULT 0,
    server_updated_at  TEXT NOT NULL,
    PRIMARY KEY (account_id, tbl, row_id)
);

CREATE INDEX idx_sync_rows_seq ON sync_rows(account_id, seq);
