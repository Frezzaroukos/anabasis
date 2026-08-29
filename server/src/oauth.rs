//! "Sign in with Google" — δορμάν μέχρι να οριστούν τα env vars
//! (ANABASIS_GOOGLE_CLIENT_ID/SECRET, βλ. app::GoogleOAuthConfig). Ροή:
//! `/start` → 302 στο Google consent screen (state = CSRF token, single-use,
//! 10' ζωή) → `/callback` ανταλλάσσει το code για access_token, διαβάζει το
//! email από το userinfo endpoint (ΟΧΙ decode χωρίς signature verification
//! του id_token — προτιμάται το userinfo endpoint, εξίσου έγκυρο εδώ) και
//! login/signup-άρει τον λογαριασμό, μετά redirect με το session token σε
//! URL fragment (ποτέ σε server log μέσω query string).

use axum::extract::{Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use time::Duration as TimeDuration;
use uuid::Uuid;

use crate::app::AppState;
use crate::auth::{create_session, generate_token, hash_password, normalize_email};
use crate::error::AppError;
use crate::util::{iso_in, now, now_iso, parse_iso};

const STATE_LIFETIME: TimeDuration = TimeDuration::minutes(10);

pub async fn providers(State(state): State<AppState>) -> impl IntoResponse {
    Json(serde_json::json!({ "google": state.google_oauth.is_some() }))
}

pub async fn google_start(State(state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    let Some(cfg) = state.google_oauth.as_ref() else {
        return Err(AppError::oauth_disabled());
    };

    // Ευκαιριακό cleanup — best-effort, ίδιο πνεύμα με το session touch στο auth.rs.
    let _ = sqlx::query("DELETE FROM oauth_states WHERE expires_at <= ?")
        .bind(now_iso())
        .execute(&state.pool)
        .await;

    let state_token = generate_token();
    sqlx::query("INSERT INTO oauth_states (state, created_at, expires_at) VALUES (?, ?, ?)")
        .bind(&state_token)
        .bind(now_iso())
        .bind(iso_in(STATE_LIFETIME))
        .execute(&state.pool)
        .await?;

    let auth_url = google_auth_url(cfg, &state_token)?;
    Ok((
        StatusCode::FOUND,
        [(header::LOCATION, auth_url.to_string())],
    ))
}

#[derive(Deserialize)]
pub struct GoogleCallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

pub async fn google_callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<GoogleCallbackQuery>,
) -> Result<impl IntoResponse, AppError> {
    let Some(cfg) = state.google_oauth.as_ref() else {
        return Err(AppError::oauth_disabled());
    };

    let Some(state_token) = query.state else {
        return Err(AppError::bad_request("invalid_state", "Λείπει το state."));
    };
    // Consume ΠΡΩΤΑ (single-use, atomic DELETE…RETURNING) — πριν αγγίξουμε
    // καθόλου το attacker-controlled `code`/`error`. Το Google επιστρέφει το
    // state ό,τι κι αν απαντήσει ο χρήστης στο consent screen, οπότε αυτό
    // ισχύει και στο happy path και στο deny-path.
    consume_oauth_state(&state.pool, &state_token).await?;

    if let Some(err) = query.error {
        return Err(AppError::bad_request(
            "oauth_denied",
            format!("Το Google επέστρεψε σφάλμα: {err}"),
        ));
    }
    let Some(code) = query.code else {
        return Err(AppError::bad_request(
            "missing_code",
            "Λείπει ο κωδικός από το Google.",
        ));
    };

    let access_token = exchange_code(&state.http_client, cfg, &code).await?;
    let info = fetch_userinfo(&state.http_client, &access_token).await?;
    let email = verified_email(&info)?;

    let account = find_or_create_google_account(&state, &email).await?;

    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok());
    let token = create_session(&state.pool, &account.id, user_agent).await?;

    let redirect_url = format!(
        "{}/settings#oauth={token}",
        cfg.public_url.trim_end_matches('/'),
    );
    Ok((StatusCode::FOUND, [(header::LOCATION, redirect_url)]))
}

/* ─────────── CSRF state store ─────────── */

/// Atomic single-use: DELETE…RETURNING βγάζει και σβήνει σε ένα round-trip —
/// δύο ταυτόχρονες χρήσεις του ίδιου state δεν μπορούν και οι δύο να πετύχουν.
async fn consume_oauth_state(pool: &sqlx::SqlitePool, state_token: &str) -> Result<(), AppError> {
    let expires_at: Option<String> =
        sqlx::query_scalar("DELETE FROM oauth_states WHERE state = ? RETURNING expires_at")
            .bind(state_token)
            .fetch_optional(pool)
            .await?;

    let Some(expires_at) = expires_at else {
        return Err(AppError::bad_request(
            "invalid_state",
            "Άκυρο ή ήδη χρησιμοποιημένο state.",
        ));
    };
    let expires = parse_iso(&expires_at).ok_or_else(|| {
        AppError::bad_request("invalid_state", "Άκυρο ή ήδη χρησιμοποιημένο state.")
    })?;
    if expires <= now() {
        return Err(AppError::bad_request("invalid_state", "Το state έληξε."));
    }
    Ok(())
}

/* ─────────── Google auth URL ─────────── */

/// Καθαρή/testable: χτίζει το consent-screen URL χωρίς κανένα I/O.
fn google_auth_url(
    cfg: &crate::app::GoogleOAuthConfig,
    state_token: &str,
) -> Result<reqwest::Url, AppError> {
    let redirect_uri = google_redirect_uri(cfg);
    reqwest::Url::parse_with_params(
        "https://accounts.google.com/o/oauth2/v2/auth",
        &[
            ("client_id", cfg.client_id.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("response_type", "code"),
            ("scope", "openid email"),
            ("state", state_token),
            ("access_type", "online"),
            ("prompt", "select_account"),
        ],
    )
    .map_err(|_| AppError::internal("Αποτυχία δημιουργίας OAuth URL."))
}

fn google_redirect_uri(cfg: &crate::app::GoogleOAuthConfig) -> String {
    format!(
        "{}/api/auth/oauth/google/callback",
        cfg.public_url.trim_end_matches('/'),
    )
}

/* ─────────── Token exchange / userinfo ─────────── */

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
}

async fn exchange_code(
    client: &reqwest::Client,
    cfg: &crate::app::GoogleOAuthConfig,
    code: &str,
) -> Result<String, AppError> {
    let redirect_uri = google_redirect_uri(cfg);
    let params = [
        ("code", code),
        ("client_id", cfg.client_id.as_str()),
        ("client_secret", cfg.client_secret.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
        ("grant_type", "authorization_code"),
    ];

    let res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "google token exchange request failed");
            AppError::oauth_provider_error()
        })?;

    if !res.status().is_success() {
        tracing::error!(status = %res.status(), "google token exchange rejected");
        return Err(AppError::oauth_provider_error());
    }

    res.json::<TokenResponse>()
        .await
        .map(|t| t.access_token)
        .map_err(|e| {
            tracing::error!(error = %e, "unexpected google token response shape");
            AppError::oauth_provider_error()
        })
}

/// Google OIDC userinfo — ΟΧΙ decode του id_token χωρίς signature verification.
#[derive(Debug, Deserialize)]
struct GoogleUserInfo {
    email: Option<String>,
    email_verified: Option<bool>,
}

async fn fetch_userinfo(
    client: &reqwest::Client,
    access_token: &str,
) -> Result<GoogleUserInfo, AppError> {
    let res = client
        .get("https://openidconnect.googleapis.com/v1/userinfo")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "google userinfo request failed");
            AppError::oauth_provider_error()
        })?;

    if !res.status().is_success() {
        tracing::error!(status = %res.status(), "google userinfo rejected");
        return Err(AppError::oauth_provider_error());
    }

    res.json::<GoogleUserInfo>().await.map_err(|e| {
        tracing::error!(error = %e, "unexpected google userinfo response shape");
        AppError::oauth_provider_error()
    })
}

/// Καθαρή/testable: απορρίπτει οτιδήποτε δεν είναι ρητά επιβεβαιωμένο email.
fn verified_email(info: &GoogleUserInfo) -> Result<String, AppError> {
    match (&info.email, info.email_verified) {
        (Some(email), Some(true)) if !email.trim().is_empty() => Ok(normalize_email(email)),
        _ => Err(AppError::bad_request(
            "email_not_verified",
            "Το Google email δεν είναι επιβεβαιωμένο.",
        )),
    }
}

/* ─────────── Account lookup/creation ─────────── */

#[derive(sqlx::FromRow)]
struct GoogleAccountRow {
    id: String,
    #[allow(dead_code)]
    role: String,
    disabled: bool,
}

/// Υπάρχων λογαριασμός (όποιο κι αν είναι το auth_provider του — password
/// login μένει διαθέσιμο, βλ. API-CONTRACT.md) → login. Αλλιώς νέος
/// λογαριασμός με auth_provider='google' και τυχαίο, ΠΟΤΕ αποκαλυπτόμενο
/// password hash (η γραμμή admin_email ισχύει ίδια με το κανονικό signup).
async fn find_or_create_google_account(
    state: &AppState,
    email: &str,
) -> Result<GoogleAccountRow, AppError> {
    if let Some(row) = sqlx::query_as::<_, GoogleAccountRow>(
        "SELECT id, role, disabled FROM accounts WHERE email = ?",
    )
    .bind(email)
    .fetch_optional(&state.pool)
    .await?
    {
        if row.disabled {
            return Err(AppError::disabled());
        }
        return Ok(row);
    }

    let id = Uuid::new_v4().to_string();
    let created_at = now_iso();
    let role = if state.admin_email.as_deref() == Some(email) {
        "admin"
    } else {
        "user"
    };
    // Τυχαίο 32-byte secret, hashed κανονικά με argon2 — έγκυρο PHC string
    // σαν κάθε άλλο account, απλά κανείς δεν ξέρει το plaintext του.
    let password_hash = hash_password(&generate_token())?;

    let insert = sqlx::query(
        "INSERT INTO accounts (id, email, password_hash, role, created_at, auth_provider)
         VALUES (?, ?, ?, ?, ?, 'google')",
    )
    .bind(&id)
    .bind(email)
    .bind(&password_hash)
    .bind(role)
    .bind(&created_at)
    .execute(&state.pool)
    .await;

    if let Err(sqlx::Error::Database(db_err)) = &insert {
        if db_err.is_unique_violation() {
            // Race: δημιουργήθηκε ανάμεσα στο SELECT και το INSERT — ξαναδιάβασε.
            return sqlx::query_as::<_, GoogleAccountRow>(
                "SELECT id, role, disabled FROM accounts WHERE email = ?",
            )
            .bind(email)
            .fetch_one(&state.pool)
            .await
            .map_err(AppError::from);
        }
    }
    insert?;

    Ok(GoogleAccountRow {
        id,
        role: role.to_string(),
        disabled: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app::GoogleOAuthConfig;

    fn cfg() -> GoogleOAuthConfig {
        GoogleOAuthConfig {
            client_id: "test-client-id".to_string(),
            client_secret: "test-secret".to_string(),
            public_url: "https://anabasis.axonos.dev".to_string(),
        }
    }

    #[test]
    fn verified_email_accepts_verified_true() {
        let info = GoogleUserInfo {
            email: Some("User@Example.com".to_string()),
            email_verified: Some(true),
        };
        assert_eq!(verified_email(&info).unwrap(), "user@example.com");
    }

    #[test]
    fn verified_email_rejects_unverified() {
        let info = GoogleUserInfo {
            email: Some("user@example.com".to_string()),
            email_verified: Some(false),
        };
        assert!(verified_email(&info).is_err());
    }

    #[test]
    fn verified_email_rejects_missing_verified_flag() {
        let info = GoogleUserInfo {
            email: Some("user@example.com".to_string()),
            email_verified: None,
        };
        assert!(verified_email(&info).is_err());
    }

    #[test]
    fn verified_email_rejects_missing_email() {
        let info = GoogleUserInfo {
            email: None,
            email_verified: Some(true),
        };
        assert!(verified_email(&info).is_err());
    }

    #[test]
    fn google_auth_url_carries_client_id_state_and_redirect_uri() {
        let url = google_auth_url(&cfg(), "state-abc-123").unwrap();
        assert_eq!(url.host_str(), Some("accounts.google.com"));
        let pairs: std::collections::HashMap<_, _> = url.query_pairs().collect();
        assert_eq!(
            pairs.get("client_id").map(|v| v.as_ref()),
            Some("test-client-id")
        );
        assert_eq!(
            pairs.get("state").map(|v| v.as_ref()),
            Some("state-abc-123")
        );
        assert_eq!(pairs.get("scope").map(|v| v.as_ref()), Some("openid email"));
        assert_eq!(
            pairs.get("redirect_uri").map(|v| v.as_ref()),
            Some("https://anabasis.axonos.dev/api/auth/oauth/google/callback")
        );
    }
}
