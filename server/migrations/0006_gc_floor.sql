-- gc_floor: ο υψηλότερος `seq` του οποίου το tombstone έχει ήδη γίνει GC για
-- αυτόν τον λογαριασμό (sync::prune_tombstones). Ένας client που τραβά (pull) με
-- cursor ΚΑΤΩ από αυτό μπορεί να έχασε διαγραφές που σβήστηκαν οριστικά — χωρίς
-- τα tombstones δεν υπάρχει πια τρόπος να του σταλούν. Ο server του ζητά reset
-- (reset_required στο pull) ώστε να ξανασυγχρονίσει από την αλήθεια του server
-- αντί να αναστήσει σιωπηλά σβησμένα rows (ghost). Δες server/src/sync.rs.
ALTER TABLE accounts ADD COLUMN gc_floor INTEGER NOT NULL DEFAULT 0;
