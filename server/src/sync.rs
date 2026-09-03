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
}

#[derive(Deserialize)]
pub struct PushChange {
    tbl: String,
    rows: Vec<Value>,
}

#[derive(Serialize)]
pub struct PushResponse {
    cursor: i64,
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

    if total_rows == 0 {
        let last_seq: i64 = sqlx::query_scalar("SELECT last_seq FROM accounts WHERE id = ?")
            .bind(&auth.account_id)
            .fetch_one(&state.pool)
            .await?;
        return Ok(Json(PushResponse { cursor: last_seq }));
    }

    let now = now_iso();
    let mut tx = state.pool.begin().await?;
    let mut cursor = 0i64;

    for change in &body.changes {
        for row in &change.rows {
            let row_id = row
                .get("id")
                .and_then(Value::as_str)
                .expect("επιβεβαιώθηκε πιο πάνω");
            let deleted = row.get("deleted_at").map(|v| !v.is_null()).unwrap_or(false);
            let payload = serde_json::to_string(row)
                .map_err(|_| AppError::internal("Αποτυχία σειριοποίησης row."))?;

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
                        .and_then(|v| v.get("updated_at").and_then(Value::as_str).map(str::to_owned))
                        .unwrap_or_default();
                    let incoming_updated_at =
                        row.get("updated_at").and_then(Value::as_str).unwrap_or("");
                    incoming_updated_at > existing_updated_at.as_str()
                }
            };

            if !incoming_wins {
                // Stale push — το ήδη αποθηκευμένο row είναι νεότερο (ή ίδιας
                // στιγμής). Δεν γράφουμε τίποτα, δεν καταναλώνουμε seq.
                continue;
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

    Ok(Json(PushResponse { cursor }))
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
    let changes = grouped
        .into_iter()
        .map(|(tbl, rows)| PullChangeSet { tbl, rows })
        .collect();

    Ok(Json(PullResponse {
        changes,
        cursor: new_cursor,
        has_more,
        epoch: state.epoch.clone(),
    }))
}
