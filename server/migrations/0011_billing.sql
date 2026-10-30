-- Stripe one-time checkout events. The event id is the idempotency key: a
-- retried webhook must not extend a plan twice.
CREATE TABLE billing_events (
    event_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'stripe',
    session_id TEXT,
    amount_total INTEGER,
    currency TEXT,
    days INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_billing_events_account ON billing_events(account_id, created_at);
