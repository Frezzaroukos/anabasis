-- Paid plan state. `free` is the default; `pro` is time-limited (one-time
-- purchase or admin grant). The server treats an expired `pro` as free.

ALTER TABLE accounts ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE accounts ADD COLUMN plan_expires_at TEXT;
ALTER TABLE accounts ADD COLUMN plan_source TEXT;
CREATE INDEX idx_accounts_plan ON accounts(plan, plan_expires_at);
