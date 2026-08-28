use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use axum::extract::{FromRequestParts, State};
use axum::http::header;
use axum::http::request::Parts;
use axum::response::IntoResponse;
use axum::Json;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use time::Duration as TimeDuration;
use uuid::Uuid;

use crate::app::AppState;
use crate::error::AppError;
use crate::json::AppJson;
use crate::util::{iso_in, now, now_iso, parse_iso};

const SESSION_LIFETIME: TimeDuration = TimeDuration::days(90);
const SESSION_TOUCH_INTERVAL: TimeDuration = TimeDuration::hours(1);
const MIN_PASSWORD_LEN: usize = 8;
const LOCKOUT_THRESHOLD: i64 = 5;
const LOCKOUT_CAP_MINUTES: i64 = 60;

fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

pub(crate) fn hash_password(password: &str) -> Result<String, AppError> {
    Argon2::default()
        .hash_password(password.as_bytes())
        .map(|h| h.to_string())
        .map_err(|_| AppError::internal("Αποτυχία κρυπτογράφησης κωδικού."))
}

fn verify_password(password: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

pub(crate) fn sha256_hex(input: &str) -> String {
    let digest = Sha256::digest(input.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

async fn create_session(
    pool: &sqlx::SqlitePool,
    account_id: &str,
    user_agent: Option<&str>,
) -> Result<String, AppError> {
    let token = generate_token();
    let token_hash = sha256_hex(&token);
    let created_at = now_iso();
    let expires_at = iso_in(SESSION_LIFETIME);

    sqlx::query(
        "INSERT INTO sessions (token_hash, account_id, created_at, expires_at, last_used_at, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&token_hash)
    .bind(account_id)
    .bind(&created_at)
    .bind(&expires_at)
    .bind(&created_at)
    .bind(user_agent)
    .execute(pool)
    .await?;

    Ok(token)
}

#[derive(Debug, sqlx::FromRow)]
struct AccountRow {
    id: String,
    email: String,
    password_hash: String,
    role: String,
    disabled: bool,
    failed_logins: i64,
    locked_until: Option<String>,
    created_at: String,
}

#[derive(Serialize)]
pub struct AccountPublic {
    id: String,
    email: String,
    role: String,
    created_at: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    token: String,
    account: AccountPublic,
}

#[derive(Deserialize)]
pub struct ClaimAdminRequest {
    code: String,
}

/*
 * Προαγωγή σε admin με μυστικό κωδικό (env ANABASIS_ADMIN_CODE).
 * Σύγκριση sha256-προς-sha256: σταθερό μήκος εισόδου στη σύγκριση, άρα το
 * timing δεν διαρρέει πόσοι χαρακτήρες ταίριαξαν. Το endpoint κάθεται στο
 * auth rate-limit group (10/min/IP) — brute force δεν προλαβαίνει τίποτα.
 */
pub async fn claim_admin(
    State(state): State<AppState>,
    user: AuthUser,
    AppJson(body): AppJson<ClaimAdminRequest>,
) -> Result<impl IntoResponse, AppError> {
    let Some(expected) = state.admin_code_hash.as_deref() else {
        return Err(AppError::forbidden(
            "admin_code_not_set",
            "Δεν έχει οριστεί admin code σε αυτόν τον server.",
        ));
    };
    if sha256_hex(body.code.trim()) != expected {
        return Err(AppError::forbidden("bad_code", "Λάθος κωδικός."));
    }
    sqlx::query("UPDATE accounts SET role = 'admin' WHERE id = ?")
        .bind(&user.account_id)
        .execute(&state.pool)
        .await?;
    Ok(Json(serde_json::json!({ "role": "admin" })))
}

#[derive(Deserialize)]
pub struct SignupRequest {
    email: String,
    password: String,
}

pub async fn signup(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    AppJson(body): AppJson<SignupRequest>,
) -> Result<impl IntoResponse, AppError> {
    let email = normalize_email(&body.email);
    if email.is_empty() {
        return Err(AppError::bad_request(
            "invalid_email",
            "Το email είναι υποχρεωτικό.",
        ));
    }
    if body.password.len() < MIN_PASSWORD_LEN {
        return Err(AppError::bad_request(
            "weak_password",
            format!("Ο κωδικός χρειάζεται τουλάχιστον {MIN_PASSWORD_LEN} χαρακτήρες."),
        ));
    }

    let password_hash = hash_password(&body.password)?;
    let role = if state.admin_email.as_deref() == Some(email.as_str()) {
        "admin"
    } else {
        "user"
    };
    let id = Uuid::new_v4().to_string();
    let created_at = now_iso();

    let insert = sqlx::query(
        "INSERT INTO accounts (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&email)
    .bind(&password_hash)
    .bind(role)
    .bind(&created_at)
    .execute(&state.pool)
    .await;

    if let Err(sqlx::Error::Database(db_err)) = &insert {
        if db_err.is_unique_violation() {
            return Err(AppError::conflict(
                "email_taken",
                "Το email χρησιμοποιείται ήδη.",
            ));
        }
    }
    insert?;

    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok());
    let token = create_session(&state.pool, &id, user_agent).await?;

    Ok(Json(AuthResponse {
        token,
        account: AccountPublic {
            id,
            email,
            role: role.to_string(),
            created_at,
        },
    }))
}

#[derive(Deserialize)]
pub struct LoginRequest {
    email: String,
    password: String,
}

pub async fn login(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    AppJson(body): AppJson<LoginRequest>,
) -> Result<impl IntoResponse, AppError> {
    let email = normalize_email(&body.email);

    let account = sqlx::query_as::<_, AccountRow>(
        "SELECT id, email, password_hash, role, disabled, failed_logins, locked_until, created_at
         FROM accounts WHERE email = ?",
    )
    .bind(&email)
    .fetch_optional(&state.pool)
    .await?;

    let Some(account) = account else {
        // Ίδιο κόστος verify με υπαρκτό λογαριασμό — χωρίς αυτό, το timing θα
        // πρόδιδε αν το email υπάρχει.
        let _ = verify_password(&body.password, &state.dummy_hash);
        return Err(AppError::bad_credentials());
    };

    if account.disabled {
        return Err(AppError::disabled());
    }

    if let Some(locked_until) = account.locked_until.as_deref().and_then(parse_iso) {
        if locked_until > now() {
            return Err(AppError::locked(
                "Πολλές αποτυχημένες προσπάθειες. Δοκίμασε ξανά αργότερα.",
            ));
        }
    }

    if !verify_password(&body.password, &account.password_hash) {
        let failed = account.failed_logins + 1;
        let locked_until = if failed >= LOCKOUT_THRESHOLD {
            // 2^(n-5) λεπτά, cap στο 1h· clamp το εκθέτη ώστε να μην κινδυνεύει
            // ποτέ να κάνει overflow το i64::pow σε παρατεταμένη επίθεση.
            let exp = (failed - LOCKOUT_THRESHOLD).clamp(0, 10) as u32;
            let minutes = 2i64.pow(exp).min(LOCKOUT_CAP_MINUTES);
            Some(iso_in(TimeDuration::minutes(minutes)))
        } else {
            None
        };

        sqlx::query("UPDATE accounts SET failed_logins = ?, locked_until = ? WHERE id = ?")
            .bind(failed)
            .bind(&locked_until)
            .bind(&account.id)
            .execute(&state.pool)
            .await?;

        return Err(AppError::bad_credentials());
    }

    sqlx::query("UPDATE accounts SET failed_logins = 0, locked_until = NULL WHERE id = ?")
        .bind(&account.id)
        .execute(&state.pool)
        .await?;

    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok());
    let token = create_session(&state.pool, &account.id, user_agent).await?;

    Ok(Json(AuthResponse {
        token,
        account: AccountPublic {
            id: account.id,
            email: account.email,
            role: account.role,
            created_at: account.created_at,
        },
    }))
}

pub async fn logout(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<impl IntoResponse, AppError> {
    sqlx::query("DELETE FROM sessions WHERE token_hash = ?")
        .bind(&auth.token_hash)
        .execute(&state.pool)
        .await?;
    Ok(Json(serde_json::json!({})))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct MeResponse {
    id: String,
    email: String,
    role: String,
    created_at: String,
    last_sync_at: Option<String>,
}

pub async fn me(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<impl IntoResponse, AppError> {
    let row = sqlx::query_as::<_, MeResponse>(
        "SELECT id, email, role, created_at, last_sync_at FROM accounts WHERE id = ?",
    )
    .bind(&auth.account_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(AppError::unauthorized)?;

    Ok(Json(row))
}

#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    current_password: String,
    new_password: String,
}

pub async fn change_password(
    State(state): State<AppState>,
    auth: AuthUser,
    AppJson(body): AppJson<ChangePasswordRequest>,
) -> Result<impl IntoResponse, AppError> {
    if body.new_password.len() < MIN_PASSWORD_LEN {
        return Err(AppError::bad_request(
            "weak_password",
            format!("Ο νέος κωδικός χρειάζεται τουλάχιστον {MIN_PASSWORD_LEN} χαρακτήρες."),
        ));
    }

    let current_hash: String =
        sqlx::query_scalar("SELECT password_hash FROM accounts WHERE id = ?")
            .bind(&auth.account_id)
            .fetch_one(&state.pool)
            .await?;

    if !verify_password(&body.current_password, &current_hash) {
        return Err(AppError::bad_credentials());
    }

    let new_hash = hash_password(&body.new_password)?;
    sqlx::query("UPDATE accounts SET password_hash = ? WHERE id = ?")
        .bind(&new_hash)
        .bind(&auth.account_id)
        .execute(&state.pool)
        .await?;

    // Ακυρώνει όλα τα ΑΛΛΑ sessions — κρατάει ζωντανό μόνο το τρέχον.
    sqlx::query("DELETE FROM sessions WHERE account_id = ? AND token_hash != ?")
        .bind(&auth.account_id)
        .bind(&auth.token_hash)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({})))
}

/// Extractor: bearer token → session → account (id, role). Sliding expiry:
/// ανανεώνει `expires_at`/`last_used_at` το πολύ μία φορά/ώρα.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub account_id: String,
    pub role: String,
    pub token_hash: String,
}

#[derive(sqlx::FromRow)]
struct SessionLookupRow {
    account_id: String,
    expires_at: String,
    last_used_at: Option<String>,
    role: String,
    disabled: bool,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or_else(AppError::unauthorized)?;

        let token_hash = sha256_hex(token);

        let row = sqlx::query_as::<_, SessionLookupRow>(
            "SELECT s.account_id AS account_id, s.expires_at AS expires_at, s.last_used_at AS last_used_at,
                    a.role AS role, a.disabled AS disabled
             FROM sessions s JOIN accounts a ON a.id = s.account_id
             WHERE s.token_hash = ?",
        )
        .bind(&token_hash)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(AppError::unauthorized)?;

        let expires_at = parse_iso(&row.expires_at).ok_or_else(AppError::unauthorized)?;
        if expires_at <= now() {
            return Err(AppError::unauthorized());
        }
        if row.disabled {
            return Err(AppError::disabled());
        }

        let should_touch = row
            .last_used_at
            .as_deref()
            .and_then(parse_iso)
            .map(|t| now() - t > SESSION_TOUCH_INTERVAL)
            .unwrap_or(true);

        if should_touch {
            let new_expiry = iso_in(SESSION_LIFETIME);
            let touched_at = now_iso();
            // Best-effort: αποτυχία εδώ δεν πρέπει να μπλοκάρει το request.
            let _ = sqlx::query(
                "UPDATE sessions SET expires_at = ?, last_used_at = ? WHERE token_hash = ?",
            )
            .bind(&new_expiry)
            .bind(&touched_at)
            .bind(&token_hash)
            .execute(&state.pool)
            .await;
        }

        Ok(AuthUser {
            account_id: row.account_id,
            role: row.role,
            token_hash,
        })
    }
}

/// Extractor: `AuthUser` + role == 'admin', αλλιώς 403 (API-CONTRACT.md §Admin).
pub struct AdminUser(pub AuthUser);

impl FromRequestParts<AppState> for AdminUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        if user.role != "admin" {
            return Err(AppError::forbidden(
                "forbidden",
                "Απαιτούνται δικαιώματα διαχειριστή.",
            ));
        }
        Ok(AdminUser(user))
    }
}
