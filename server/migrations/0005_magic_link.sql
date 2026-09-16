-- 0005_magic_link.sql — passwordless «magic link» login μέσω email.
-- Δορμάν μέχρι να οριστούν τα ANABASIS_SMTP_* env vars (όπως το Google OAuth
-- είναι δορμάν χωρίς ANABASIS_GOOGLE_*). Ροή: request(email) → στέλνουμε link
-- με single-use token → consume(token) → session.
--
-- Αποθηκεύουμε ΜΟΝΟ sha256(token) (ποτέ το raw token), όπως τα sessions. Το
-- consume γίνεται με DELETE…RETURNING (atomic single-use, ίδιο pattern με τα
-- oauth_states)· expires_at δίνει short TTL (15'). Ο λογαριασμός δημιουργείται
-- στο CONSUME (μετά το click = επιβεβαιωμένο email), όχι στο request — ώστε
-- request σε τυχαίο email να ΜΗΝ σπαμάρει accounts.

CREATE TABLE login_tokens (
    token_hash  TEXT PRIMARY KEY,
    email       TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL
);

-- Καθάρισμα ληγμένων/χρησιμοποιημένων + rate-limit ανά email γίνεται με scan
-- στο expires_at / email, οπότε index και στα δύο.
CREATE INDEX idx_login_tokens_expires ON login_tokens(expires_at);
CREATE INDEX idx_login_tokens_email ON login_tokens(email, created_at);
