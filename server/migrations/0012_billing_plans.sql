-- Billing plans: monthly subscription + founding/standard lifetime.
-- Existing 0011 rows keep NULL plan/kind and remain valid legacy events.
ALTER TABLE billing_events ADD COLUMN plan TEXT;
ALTER TABLE billing_events ADD COLUMN kind TEXT;
ALTER TABLE billing_events ADD COLUMN subscription_id TEXT;
ALTER TABLE billing_events ADD COLUMN payment_intent TEXT;
CREATE INDEX idx_billing_events_plan ON billing_events(plan, kind);
CREATE INDEX idx_billing_events_payment_intent ON billing_events(payment_intent);

-- Stripe subscription → account mapping for invoice.paid renewals.
CREATE TABLE billing_subscriptions (
    subscription_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    status TEXT NOT NULL,
    current_period_end TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_billing_subscriptions_account ON billing_subscriptions(account_id);
