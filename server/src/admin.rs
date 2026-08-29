use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};

use crate::app::AppState;
use crate::auth::AdminUser;
use crate::error::AppError;
use crate::json::AppJson;
use crate::util::now;

#[derive(Serialize, sqlx::FromRow)]
pub struct AdminUserRow {
    id: String,
    email: String,
    role: String,
    disabled: bool,
    created_at: String,
    last_sync_at: Option<String>,
    row_count: i64,
}

pub async fn list_users(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<impl IntoResponse, AppError> {
    let rows = sqlx::query_as::<_, AdminUserRow>(
        "SELECT a.id, a.email, a.role, a.disabled, a.created_at, a.last_sync_at,
                (SELECT COUNT(*) FROM sync_rows sr WHERE sr.account_id = a.id) AS row_count
         FROM accounts a ORDER BY a.created_at",
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

#[derive(Deserialize)]
pub struct DisableRequest {
    disabled: bool,
}

pub async fn disable_user(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
    AppJson(body): AppJson<DisableRequest>,
) -> Result<impl IntoResponse, AppError> {
    let result = sqlx::query("UPDATE accounts SET disabled = ? WHERE id = ?")
        .bind(body.disabled)
        .bind(&id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::not_found());
    }

    if body.disabled {
        // Disable σκοτώνει και τα sessions του — άμεση αποσύνδεση παντού.
        sqlx::query("DELETE FROM sessions WHERE account_id = ?")
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    Ok(Json(serde_json::json!({})))
}

fn generate_temp_password() -> String {
    let mut bytes = [0u8; 12];
    rand::rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

pub async fn reset_password(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM accounts WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;
    if exists.is_none() {
        return Err(AppError::not_found());
    }

    let temp_password = generate_temp_password();
    let temp_hash = crate::auth::hash_password(&temp_password)?;

    // Νέος κωδικός = ακύρωσε ΟΛΑ τα ενεργά sessions του χρήστη (αλλιώς ένας
    // κλεμμένος token θα επιβίωνε του reset) και καθάρισε τυχόν lockout.
    sqlx::query(
        "UPDATE accounts SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?",
    )
    .bind(&temp_hash)
    .bind(&id)
    .execute(&state.pool)
    .await?;
    sqlx::query("DELETE FROM sessions WHERE account_id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "temp_password": temp_password })))
}

#[derive(Serialize)]
pub struct StatsResponse {
    accounts: i64,
    rows: i64,
    db_size_bytes: i64,
    uptime_seconds: i64,
}

pub async fn stats(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<impl IntoResponse, AppError> {
    let accounts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM accounts")
        .fetch_one(&state.pool)
        .await?;
    let rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sync_rows")
        .fetch_one(&state.pool)
        .await?;
    let db_size_bytes = std::fs::metadata(&state.db_path)
        .map(|m| m.len() as i64)
        .unwrap_or(0);
    let uptime_seconds = (now() - state.started_at).whole_seconds().max(0);

    Ok(Json(StatsResponse {
        accounts,
        rows,
        db_size_bytes,
        uptime_seconds,
    }))
}
