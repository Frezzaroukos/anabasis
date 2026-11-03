-- User reports for profiles/avatars. No automated moderation exists: this is
-- the manual review queue (report flow + admin visibility), nothing more.
CREATE TABLE reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    target_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    -- Snapshot: the reported handle at report time, kept even if the target
    -- renames later. `target_account_id` remains the authoritative link.
    target_username TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'nudity', 'impersonation', 'other')),
    note TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
    created_at TEXT NOT NULL,
    reviewed_at TEXT,
    reviewer_id TEXT REFERENCES accounts(id) ON DELETE SET NULL
);

-- Admin queue: open/recent scans by status and time.
CREATE INDEX reports_status_created_idx ON reports(status, created_at DESC);
CREATE INDEX reports_created_idx ON reports(created_at DESC);

-- One OPEN report per reporter/target. A closed report does not block a new
-- report later, and duplicate submissions stay idempotent (no queue spam).
CREATE UNIQUE INDEX reports_open_reporter_target_idx
ON reports(reporter_id, target_account_id)
WHERE status = 'open';
