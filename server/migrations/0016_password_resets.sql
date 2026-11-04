-- Password reset tokens: only sha256 hashes are stored, single-use, short TTL.
CREATE TABLE password_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX password_reset_tokens_account_idx ON password_reset_tokens(account_id);
CREATE INDEX password_reset_tokens_expiry_idx ON password_reset_tokens(expires_at);
