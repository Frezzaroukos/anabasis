-- Opaque per-account token for avatar delivery. Data URLs never leave the API
-- after this migration: clients get /api/social/avatar/<token>, which is
-- cacheable and cannot be guessed from a username.
ALTER TABLE accounts ADD COLUMN avatar_token TEXT;

UPDATE accounts
SET avatar_token = lower(hex(randomblob(16)))
WHERE avatar_url IS NOT NULL AND avatar_token IS NULL;

CREATE UNIQUE INDEX accounts_avatar_token_idx
ON accounts(avatar_token)
WHERE avatar_token IS NOT NULL;
