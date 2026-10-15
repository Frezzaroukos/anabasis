-- gc_graveyard: μόνιμο ίχνος των (tbl, row_id) που έγιναν GC (sync::prune_tombstones).
-- Το gc_floor (0006) φρενάρει clients που στέλνουν ΕΓΚΥΡΟ pull cursor κάτω από το
-- floor — όμως ένας παλιός/cached client που ΔΕΝ στέλνει cursor (ή το αγνοεί) το
-- παρακάμπτει και ανασταίνει GC-αρισμένο row γράφοντάς το ως νέα γραμμή. Αυτός ο
-- πίνακας κάνει τον έλεγχο ΑΝΕΞΑΡΤΗΤΟ από τον client: κάθε push για id που ζει εδώ
-- απορρίπτεται server-side (κανένα write), από legacy ή νέο client. Δες server/src/sync.rs.
--
-- Μόνο ids (tbl, row_id) — ΟΧΙ payload· ένα σβησμένο row δεν «ξαναγεννιέται» ποτέ με
-- το ίδιο uuid. Ο πίνακας είναι append-only by design (το ίχνος θανάτου πρέπει να
-- επιβιώνει) — γι' αυτό το 0006/0007 είναι μονόδρομα (δες docs/STAGED-BUILD.md).
CREATE TABLE gc_graveyard (
    account_id  TEXT NOT NULL,
    tbl         TEXT NOT NULL,
    row_id      TEXT NOT NULL,
    gc_at       TEXT NOT NULL,
    PRIMARY KEY (account_id, tbl, row_id)
);
