use std::collections::BTreeMap;

use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::app::AppState;
use crate::auth::AuthUser;
use crate::error::AppError;
use crate::json::AppJson;
use crate::util::now_iso;

/// 15 backup tables του client — allowlist, βλ. API-CONTRACT.md §SQLite schema.
const ALLOWED_TABLES: &[&str] = &[
    "users",
    "exercises",
    "workouts",
    "sets",
    "personal_records",
    "skills",
    "skill_steps",
    "user_skill_progress",
    "user_skill_step_completions",
    "app_settings",
    "body_metrics",
    "programs",
    "program_days",
    "program_exercises",
    "activities",
    "goals",
    "custom_trackers",
    "custom_tracker_entries",
];

const MAX_PUSH_ROWS: usize = 5000;
const DEFAULT_PULL_LIMIT: i64 = 1000;
const MAX_PULL_LIMIT: i64 = 2000;

#[derive(Deserialize)]
pub struct PushRequest {
    changes: Vec<PushChange>,
    /// Ο pull cursor της συσκευής τη στιγμή του push. Αν είναι πίσω από το
    /// gc_floor, το push ΔΕΝ εφαρμόζεται (reset_required) — αλλιώς ένα τοπικά
    /// edited ghost θα ανασταινόταν. `None` = παλιός client (δες push()).
    #[serde(default)]
    cursor: Option<i64>,
}

#[derive(Deserialize)]
pub struct PushChange {
    tbl: String,
    rows: Vec<Value>,
}

#[derive(Serialize)]
pub struct PushResponse {
    cursor: i64,
    /// Η συσκευή είναι πίσω από το gc_floor· το push ΑΠΟΡΡΙΦΘΗΚΕ (τίποτα δεν
    /// γράφτηκε) και πρέπει πρώτα να κάνει destructive reset. Βλ. pull()·reset.
    reset_required: bool,
}

pub async fn push(
    State(state): State<AppState>,
    auth: AuthUser,
    AppJson(body): AppJson<PushRequest>,
) -> Result<impl IntoResponse, AppError> {
    let total_rows: usize = body.changes.iter().map(|c| c.rows.len()).sum();
    if total_rows > MAX_PUSH_ROWS {
        return Err(AppError::payload_too_large());
    }

    // Validation πριν αγγίξουμε τη βάση — μηδέν partial-write ρίσκο σε bad input.
    for change in &body.changes {
        if !ALLOWED_TABLES.contains(&change.tbl.as_str()) {
            return Err(AppError::bad_request(
                "unknown_table",
                format!("Άγνωστος πίνακας: {}", change.tbl),
            ));
        }
        for row in &change.rows {
            if row.get("id").and_then(Value::as_str).is_none() {
                return Err(AppError::bad_request(
                    "invalid_row",
                    "Κάθε row χρειάζεται string πεδίο id.",
                ));
            }
            let user_id = row.get("user_id").and_then(Value::as_str);
            if user_id != Some(auth.account_id.as_str()) {
                return Err(AppError::bad_request(
                    "wrong_user",
                    "Το user_id του row δεν ταιριάζει με τον συνδεδεμένο λογαριασμό.",
                ));
            }
        }
    }

    // Push-side gc_floor guard. Ο client στέλνει τον pull cursor του· αν είναι
    // πίσω από το gc_floor (έχασε GC-αρισμένες διαγραφές) ΔΕΝ εφαρμόζουμε τίποτα
    // και απαντάμε reset_required. Χωρίς αυτό, ένα τοπικά edited ghost (row που
    // διαγράφηκε+GC-άρθηκε αλλού αλλά επιβιώνει στη συσκευή, updated_at μετά το
    // τελευταίο push) θα έφτανε εδώ με existing_payload == None και θα γραφόταν
    // ως ΝΕΑ γραμμή — resurrection — ΠΡΙΝ προλάβει το pull-side reset. Αφού το
    // push προηγείται του pull στον κύκλο, ο έλεγχος πρέπει να γίνεται κι εδώ.
    // Ο client, βλέποντας reset_required, κάνει destructive reset (pull από 0 +
    // purge ghosts) και ξαναστέλνει ΜΟΝΟ ό,τι είναι γνήσια νεότερο.
    //
    // Συμβατότητα: `cursor == None` = παλιός client (δεν στέλνει cursor) → κρατά
    // την προηγούμενη συμπεριφορά, το push εφαρμόζεται και η προστασία μένει στο
    // pull-side μόνο (ίδιο παράθυρο resurrection που υπήρχε ήδη — καμία οπισθοδρόμηση).
    // `cursor == 0` = φρέσκια συσκευή/fullResync → δεν φρενάρεται ποτέ (ίδια
    // συνθήκη με το pull: cursor > 0 && cursor < gc_floor).
    if let Some(cursor) = body.cursor {
        if cursor > 0 {
            let (gc_floor, last_seq): (i64, i64) =
                sqlx::query_as("SELECT gc_floor, last_seq FROM accounts WHERE id = ?")
                    .bind(&auth.account_id)
                    .fetch_one(&state.pool)
                    .await?;
            if cursor < gc_floor {
                return Ok(Json(PushResponse {
                    cursor: last_seq,
                    reset_required: true,
                }));
            }
        }
    }

    if total_rows == 0 {
        let last_seq: i64 = sqlx::query_scalar("SELECT last_seq FROM accounts WHERE id = ?")
            .bind(&auth.account_id)
            .fetch_one(&state.pool)
            .await?;
        return Ok(Json(PushResponse {
            cursor: last_seq,
            reset_required: false,
        }));
    }

    let now = now_iso();
    let mut tx = state.pool.begin().await?;
    let mut cursor = 0i64;

    // Per-account row quota (abusive-growth φρένο). Μετράμε ΟΛΑ τα sync_rows του
    // λογαριασμού (μαζί με tombstones — καταναλώνουν κι αυτά χώρο) στην αρχή της
    // transaction· επιτρέπουμε updates/deletes ακόμα και στο cap, αλλά μπλοκάρουμε
    // ΝΕΑ row_ids πέρα από το όριο. Το admin GC (prune_tombstones) ελευθερώνει χώρο.
    let existing_rows: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sync_rows WHERE account_id = ?")
            .bind(&auth.account_id)
            .fetch_one(&mut *tx)
            .await?;
    let quota = state.max_rows_per_account;
    let mut new_rows = 0i64;
    let mut written = 0i64;
    // Αν έστω ένα row στόχευε graveyard-αρισμένο id (resurrection προσπάθεια που
    // κόπηκε χωρίς write), το σηματοδοτούμε με reset_required στην απάντηση ώστε
    // ένας σύγχρονος client να καθαρίσει το τοπικό ghost. Ο legacy client το
    // αγνοεί — αβλαβές (δες push-side graveyard guard παρακάτω).
    let mut graveyard_hit = false;

    for change in &body.changes {
        for row in &change.rows {
            let row_id = row
                .get("id")
                .and_then(Value::as_str)
                .expect("επιβεβαιώθηκε πιο πάνω");
            let deleted = row.get("deleted_at").map(|v| !v.is_null()).unwrap_or(false);

            // Push-side graveyard guard (ανεξάρτητος από τον client). Αν το
            // (tbl, row_id) έχει ήδη γίνει GC (ζει στο gc_graveyard), ΚΑΘΕ push
            // γι' αυτό είναι resurrection ενός οριστικά σβησμένου row — το
            // κόβουμε ΧΩΡΙΣ write, είτε ο client έστειλε cursor είτε όχι (το
            // live bundle δεν στέλνει). Έτσι ο anti-ghost έλεγχος δεν εξαρτάται
            // από συμπεριφορά του client (gc_floor πιάνει μόνο έγκυρο cursor <
            // floor). Τα soft-deleted ids δεν ξαναγεννιούνται με το ίδιο uuid,
            // οπότε η απόρριψη δεν χάνει ποτέ γνήσιο νέο row.
            let in_graveyard: Option<String> = sqlx::query_scalar(
                "SELECT row_id FROM gc_graveyard
                     WHERE account_id = ? AND tbl = ? AND row_id = ?",
            )
            .bind(&auth.account_id)
            .bind(&change.tbl)
            .bind(row_id)
            .fetch_optional(&mut *tx)
            .await?;
            if in_graveyard.is_some() {
                graveyard_hit = true;
                continue;
            }

            // Clock-skew guard (4b): το LWW συγκρίνει client `updated_at`, οπότε
            // μια συσκευή με μπροστά ρολόι θα «κέρδιζε» πάντα με μελλοντικό
            // timestamp — κι ένα νεότερο (αλλά σωστό) edit άλλης συσκευής θα
            // έχανε. Κόβουμε (clamp) ό,τι είναι μπροστά από το ρολόι του server
            // (η ΜΙΑ κοινή αναφορά) ΚΑΙ στη σύγκριση ΚΑΙ στο αποθηκευμένο
            // payload, ώστε να μην ξανα-«φουσκώσει» σε επόμενο pull/σύγκριση.
            let raw_updated_at = row.get("updated_at").and_then(Value::as_str).unwrap_or("");
            let (incoming_updated_at, payload) = if raw_updated_at > now.as_str() {
                let mut clamped = row.clone();
                if let Some(obj) = clamped.as_object_mut() {
                    obj.insert("updated_at".to_string(), Value::String(now.clone()));
                }
                let p = serde_json::to_string(&clamped)
                    .map_err(|_| AppError::internal("Αποτυχία σειριοποίησης row."))?;
                (now.clone(), p)
            } else {
                let p = serde_json::to_string(row)
                    .map_err(|_| AppError::internal("Αποτυχία σειριοποίησης row."))?;
                (raw_updated_at.to_string(), p)
            };

            // Πραγματικό last-WRITE-wins: πριν το χτύπησε δεδομένα ταξιδιού
            // από παλιότερο push (π.χ. συσκευή offline που ξαναβγαίνει
            // online αργότερα), συγκρίνουμε το `updated_at` του incoming
            // row με ό,τι είναι ήδη αποθηκευμένο — ΟΧΙ σειρά άφιξης. Χωρίς
            // αυτό, ένα stale push θα μπορούσε να διαγράψει σιωπηλά μια
            // νεότερη αλλαγή από άλλη συσκευή (lost update). Ίδια σύμβαση
            // με το client-side incomingWins (src/lib/sync/index.ts):
            // νεότερο updated_at κερδίζει· ισοπαλία κρατά ό,τι υπάρχει ήδη
            // (χωρίς tiebreak by id — εδώ το row_id είναι το ΙΔΙΟ και στις
            // δύο πλευρές, δεν είναι σύγκρουση δύο διαφορετικών ids).
            let existing_payload: Option<String> = sqlx::query_scalar(
                "SELECT payload FROM sync_rows WHERE account_id = ? AND tbl = ? AND row_id = ?",
            )
            .bind(&auth.account_id)
            .bind(&change.tbl)
            .bind(row_id)
            .fetch_optional(&mut *tx)
            .await?;

            let incoming_wins = match &existing_payload {
                None => true,
                Some(existing_payload) => {
                    let existing_updated_at = serde_json::from_str::<Value>(existing_payload)
                        .ok()
                        .and_then(|v| {
                            v.get("updated_at")
                                .and_then(Value::as_str)
                                .map(str::to_owned)
                        })
                        .unwrap_or_default();
                    incoming_updated_at.as_str() > existing_updated_at.as_str()
                }
            };

            if !incoming_wins {
                // Stale push — το ήδη αποθηκευμένο row είναι νεότερο (ή ίδιας
                // στιγμής). Δεν γράφουμε τίποτα, δεν καταναλώνουμε seq.
                continue;
            }

            // Νέο row_id (δεν υπάρχει payload) → μετράει στο quota growth. Updates
            // σε υπαρκτά rows δεν αυξάνουν το πλήθος, άρα δεν φρενάρονται εδώ.
            if existing_payload.is_none() {
                if existing_rows + new_rows >= quota {
                    // Rollback (drop tx) — μηδέν partial write.
                    return Err(AppError::quota_exceeded());
                }
                new_rows += 1;
            }

            // last_seq bump + upsert ΣΤΗΝ ΙΔΙΑ transaction — αλλιώς ο pull
            // cursor μπορεί να προσπεράσει ένα committed row (lost update).
            let seq: i64 = sqlx::query_scalar(
                "UPDATE accounts SET last_seq = last_seq + 1 WHERE id = ? RETURNING last_seq",
            )
            .bind(&auth.account_id)
            .fetch_one(&mut *tx)
            .await?;

            sqlx::query(
                "INSERT INTO sync_rows (account_id, tbl, row_id, payload, seq, deleted, server_updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(account_id, tbl, row_id) DO UPDATE SET
                   payload = excluded.payload,
                   seq = excluded.seq,
                   deleted = excluded.deleted,
                   server_updated_at = excluded.server_updated_at",
            )
            .bind(&auth.account_id)
            .bind(&change.tbl)
            .bind(row_id)
            .bind(&payload)
            .bind(seq)
            .bind(deleted)
            .bind(&now)
            .execute(&mut *tx)
            .await?;

            cursor = seq;
            written += 1;
        }
    }

    // Αν ΟΛΑ τα rows αυτού του push ήταν LWW losers, δεν καταναλώθηκε seq —
    // ο cursor πρέπει να δείχνει το ΤΡΕΧΟΝ last_seq, όχι το αρχικό 0 (αλλιώς
    // ο caller θα νόμιζε ότι ο λογαριασμός δεν έχει προχωρήσει καθόλου).
    if cursor == 0 {
        cursor = sqlx::query_scalar("SELECT last_seq FROM accounts WHERE id = ?")
            .bind(&auth.account_id)
            .fetch_one(&mut *tx)
            .await?;
    }

    sqlx::query("UPDATE accounts SET last_sync_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&auth.account_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    // Παρατηρησιμότητα του write path (uuid, όχι PII): πόσα γράφτηκαν όντως vs
    // πόσα στάλθηκαν (η διαφορά = LWW losers), + πόσα νέα rows.
    tracing::debug!(
        account_id = %auth.account_id,
        received = total_rows,
        written,
        new_rows,
        cursor,
        graveyard_hit,
        "sync push committed"
    );

    Ok(Json(PushResponse {
        cursor,
        // Γνήσια rows γράφτηκαν κανονικά· αν έστω ένα graveyard id κόπηκε,
        // ζητάμε reset ώστε σύγχρονος client να καθαρίσει το τοπικό ghost.
        reset_required: graveyard_hit,
    }))
}

/// Tombstone garbage-collection: σβήνει soft-deleted sync_rows (`deleted = 1`)
/// που έγιναν tombstone ΠΡΙΝ από `horizon_days` (κατά `server_updated_at`,
/// server-assigned wall clock). Επιστρέφει πόσα rows κόπηκαν.
///
/// ## Γιατί είναι ασφαλές για cursors/epoch
/// Το pull είναι `WHERE seq > cursor ORDER BY seq` — η αφαίρεση ΟΛΟΚΛΗΡΩΝ rows
/// (ποτέ renumber) απλώς αφήνει «κενά» στη σειρά των seq· ο cursor μένει
/// μονότονος, το `has_more` σωστό, το epoch αμετάβλητο.
///
/// ## Ο μοναδικός εναπομείνας κίνδυνος (γι' αυτό το horizon)
/// Client που είχε συγχρονίσει το row ΠΡΙΝ διαγραφεί, μετά έμεινε offline πέρα
/// από το horizon: αν κόψουμε το tombstone, δεν θα δει ποτέ τη διαγραφή (ghost
/// row). Ένα γενναιόδωρο horizon (default 90 μέρες) το κάνει πρακτικά αδύνατο —
/// γι' αυτό ο caller κάνει clamp σε ελάχιστο ασφαλές όριο.
pub async fn prune_tombstones(
    pool: &sqlx::SqlitePool,
    horizon_days: i64,
) -> Result<u64, sqlx::Error> {
    let cutoff = crate::util::iso_days_ago(horizon_days);
    let now = crate::util::now_iso();
    let mut tx = pool.begin().await?;

    // ΠΡΙΝ το delete (όσο τα tombstones υπάρχουν ακόμα): ανέβασε το gc_floor κάθε
    // λογαριασμού στον μεγαλύτερο seq που πρόκειται να κοπεί. Έτσι μένει μόνιμο
    // ίχνος «μέχρι εδώ υπήρχαν διαγραφές που χάθηκαν» — ο pull το χρησιμοποιεί
    // για να ζητήσει reset από συσκευές πολύ πίσω (αλλιώς θα ανάσταιναν ghost).
    sqlx::query(
        "UPDATE accounts SET gc_floor = MAX(gc_floor, COALESCE(
             (SELECT MAX(seq) FROM sync_rows
                WHERE sync_rows.account_id = accounts.id
                  AND deleted = 1 AND server_updated_at < ?),
             gc_floor))",
    )
    .bind(&cutoff)
    .execute(&mut *tx)
    .await?;

    // ΠΡΙΝ το delete (ίδιο παράθυρο): κατέγραψε τα (account_id, tbl, row_id) που
    // πρόκειται να κοπούν στο gc_graveyard. Το gc_floor πιάνει μόνο clients με
    // έγκυρο cursor κάτω από το floor· ένας παλιός/cached client που δεν στέλνει
    // cursor το παρακάμπτει. Το graveyard κάνει τον anti-resurrection έλεγχο
    // ΑΝΕΞΑΡΤΗΤΟ από τον client — το push() απορρίπτει κάθε id που ζει εδώ.
    // ON CONFLICT DO NOTHING: idempotent αν το GC ξανατρέξει (gc_at κρατά το
    // πρώτο ίχνος· ο πίνακας είναι append-only by design).
    sqlx::query(
        "INSERT INTO gc_graveyard (account_id, tbl, row_id, gc_at)
         SELECT account_id, tbl, row_id, ? FROM sync_rows
            WHERE deleted = 1 AND server_updated_at < ?
         ON CONFLICT(account_id, tbl, row_id) DO NOTHING",
    )
    .bind(&now)
    .bind(&cutoff)
    .execute(&mut *tx)
    .await?;

    let result = sqlx::query("DELETE FROM sync_rows WHERE deleted = 1 AND server_updated_at < ?")
        .bind(&cutoff)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(result.rows_affected())
}

#[derive(Deserialize)]
pub struct PullRequest {
    cursor: i64,
    limit: Option<i64>,
}

#[derive(Serialize)]
pub struct PullChangeSet {
    tbl: String,
    rows: Vec<Value>,
}

#[derive(Serialize)]
pub struct PullResponse {
    changes: Vec<PullChangeSet>,
    cursor: i64,
    has_more: bool,
    epoch: String,
    /// Η συσκευή είναι πίσω από το gc_floor (έχασε διαγραφές που έγιναν GC) και
    /// πρέπει να ξανασυγχρονίσει από την αρχή αντί να σπρώξει παλιά κατάσταση.
    reset_required: bool,
}

#[derive(sqlx::FromRow)]
struct SyncRowRecord {
    tbl: String,
    payload: String,
    seq: i64,
}

pub async fn pull(
    State(state): State<AppState>,
    auth: AuthUser,
    AppJson(body): AppJson<PullRequest>,
) -> Result<impl IntoResponse, AppError> {
    if body.cursor < 0 {
        return Err(AppError::bad_request(
            "invalid_cursor",
            "Ο cursor δεν μπορεί να είναι αρνητικός.",
        ));
    }
    let limit = body
        .limit
        .unwrap_or(DEFAULT_PULL_LIMIT)
        .clamp(1, MAX_PULL_LIMIT);

    let mut tx = state.pool.begin().await?;

    // gc_floor: ο μεγαλύτερος seq του οποίου το tombstone έχει γίνει GC. Αν ο
    // cursor της συσκευής είναι κάτω από αυτό (και όχι 0 = φρέσκο pull), μπορεί
    // να έχασε διαγραφές που δεν στέλνονται πια — ζητάμε reset. cursor == 0
    // κατεβάζει ούτως ή άλλως ολόκληρο το ζωντανό σύνολο, άρα είναι ασφαλές.
    let gc_floor: i64 = sqlx::query_scalar("SELECT gc_floor FROM accounts WHERE id = ?")
        .bind(&auth.account_id)
        .fetch_one(&mut *tx)
        .await?;
    let reset_required = body.cursor > 0 && body.cursor < gc_floor;

    // limit+1 για να ξέρουμε αν υπάρχουν κι άλλα, χωρίς δεύτερο COUNT query.
    let mut rows = sqlx::query_as::<_, SyncRowRecord>(
        "SELECT tbl, payload, seq FROM sync_rows WHERE account_id = ? AND seq > ? ORDER BY seq LIMIT ?",
    )
    .bind(&auth.account_id)
    .bind(body.cursor)
    .bind(limit + 1)
    .fetch_all(&mut *tx)
    .await?;

    let has_more = rows.len() as i64 > limit;
    if has_more {
        rows.truncate(limit as usize);
    }
    let new_cursor = rows.last().map(|r| r.seq).unwrap_or(body.cursor);

    let now = now_iso();
    sqlx::query("UPDATE accounts SET last_sync_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&auth.account_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    let mut grouped: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for row in rows {
        let value: Value = serde_json::from_str(&row.payload)
            .map_err(|_| AppError::internal("Κατεστραμμένο payload στη βάση."))?;
        grouped.entry(row.tbl).or_default().push(value);
    }
    let changes: Vec<PullChangeSet> = grouped
        .into_iter()
        .map(|(tbl, rows)| PullChangeSet { tbl, rows })
        .collect();

    tracing::debug!(
        account_id = %auth.account_id,
        from_cursor = body.cursor,
        to_cursor = new_cursor,
        tables = changes.len(),
        has_more,
        "sync pull served"
    );

    Ok(Json(PullResponse {
        changes,
        cursor: new_cursor,
        has_more,
        epoch: state.epoch.clone(),
        reset_required,
    }))
}
