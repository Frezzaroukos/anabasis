-- 0004_social.sql — φιλίες + δημόσιο aggregate προφίλ («Your Ascent» social).
-- Βλ. docs/DESIGN-SOCIAL.md. ΚΡΙΣΙΜΟ: το social graph ΔΕΝ περνά ΠΟΤΕ από το
-- per-account sync_rows mirror (ο sync.rs απορρίπτει rows με ξένο user_id).
-- Ζει μόνο εδώ, πίσω από dedicated /api/social endpoints με SQL-enforced privacy.

-- Δημόσια ταυτότητα: μοναδικό handle + εμφανιζόμενο όνομα + opt-in ορατότητα.
-- username/display_name nullable (οι περισσότεροι χρήστες δεν φτιάχνουν handle).
ALTER TABLE accounts ADD COLUMN username TEXT;
ALTER TABLE accounts ADD COLUMN display_name TEXT;
ALTER TABLE accounts ADD COLUMN share_profile INTEGER NOT NULL DEFAULT 0;

-- Μοναδικότητα handle αλλά επιτρέπονται πολλά NULL → partial unique index.
CREATE UNIQUE INDEX idx_accounts_username ON accounts(username) WHERE username IS NOT NULL;

-- Κατευθυνόμενη ακμή φιλίας. status: 'pending' (αναμονή αποδοχής) | 'accepted'.
-- decline/unfriend = ΔΙΑΓΡΑΦΗ της ακμής (όχι ξεχωριστό status) → καθαρό re-request.
-- Reads κάνουν UNION και στις δύο κατευθύνσεις (requester ή addressee).
CREATE TABLE friendships (
    requester_id  TEXT NOT NULL REFERENCES accounts(id),
    addressee_id  TEXT NOT NULL REFERENCES accounts(id),
    status        TEXT NOT NULL DEFAULT 'pending',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    PRIMARY KEY (requester_id, addressee_id)
);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id, status);
CREATE INDEX idx_friendships_requester ON friendships(requester_id, status);

-- Opt-in aggregate snapshot — ΠΟΤΕ raw workouts/sets/PRs/body/goals. Το γεμίζει
-- ο client (client-computed XP, βλ. gamification.ts)· ο server μόνο clamp + serve.
CREATE TABLE profile_stats (
    account_id           TEXT PRIMARY KEY REFERENCES accounts(id),
    level                INTEGER NOT NULL DEFAULT 1,
    xp                   INTEGER NOT NULL DEFAULT 0,
    tier                 TEXT NOT NULL DEFAULT 'baseCamp',
    altitude_m           INTEGER NOT NULL DEFAULT 0,
    badges               TEXT NOT NULL DEFAULT '[]',
    streak_days          INTEGER NOT NULL DEFAULT 0,
    longest_streak_days  INTEGER NOT NULL DEFAULT 0,
    updated_at           TEXT NOT NULL
);
