-- Account security: distinguish a real password from the random unusable hash
-- created for passwordless accounts, and give each session a public id so the
-- account page can list/revoke individual devices without exposing token hashes.

ALTER TABLE accounts ADD COLUMN password_set INTEGER NOT NULL DEFAULT 0;
UPDATE accounts SET password_set = 1 WHERE auth_provider IS NULL;

ALTER TABLE sessions ADD COLUMN session_id TEXT;
UPDATE sessions SET session_id = lower(hex(randomblob(16))) WHERE session_id IS NULL;
CREATE UNIQUE INDEX idx_sessions_session_id ON sessions(session_id);
