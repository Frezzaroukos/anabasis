-- Meta key/value — πρώτος ένοικος: το epoch της βάσης. Αν η βάση γίνει ποτέ
-- restore από backup (ή ξαναδημιουργηθεί), το epoch αλλάζει και οι clients
-- καταλαβαίνουν ότι οι cursors τους δεν ισχύουν πια (αλλιώς: σιωπηλό desync).
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
