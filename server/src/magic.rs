//! Magic-link (passwordless) login μέσω email. Πλήρως δορμάν χωρίς SMTP config
//! (`AppState.email == None` → providers `magic:false`, endpoints 400). Ροή:
//!
//!   POST /api/auth/magic/request  {email}  → ΠΑΝΤΑ 200 {ok:true} (no timing/
//!       enumeration leak)· αν configured + όχι throttled, στέλνει email με
//!       single-use link (TTL 15').
//!   POST /api/auth/magic/consume  {token}  → find-or-create account → session
//!       → AuthResponse (ίδιο σχήμα με το password login).
//!
//! Ασφάλεια: κρατάμε ΜΟΝΟ sha256(token) (ποτέ raw)· το consume είναι
//! DELETE…RETURNING = atomic single-use (ίδιο pattern με τα oauth_states)· ο
//! λογαριασμός δημιουργείται στο consume (το click = επιβεβαιωμένο email), όχι
//! στο request, ώστε request σε τυχαίο email να μη σπαμάρει accounts.

use axum::extract::State;
use axum::http::{header, HeaderMap};
use axum::Json;
use lettre::message::{Mailbox, Message, MultiPart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Tokio1Executor};
use serde::Deserialize;
use serde_json::json;
use time::Duration as TimeDuration;

use crate::app::{AppState, EmailConfig};
use crate::auth::{
    find_or_create_account, generate_token, issue_auth_response, normalize_email, sha256_hex,
    AuthResponse,
};
use crate::error::AppError;
use crate::json::AppJson;
use crate::util::{iso_in, now, now_iso, parse_iso};

/// Πόσο ζει ένας magic-link πριν λήξει.
const TOKEN_TTL: TimeDuration = TimeDuration::minutes(15);
/// Ελάχιστο διάστημα μεταξύ δύο emails στο ίδιο address (anti-bombing).
const RESEND_THROTTLE: TimeDuration = TimeDuration::seconds(60);

#[derive(Deserialize)]
pub struct RequestBody {
    email: String,
}

/// Ζητά magic-link. Επιστρέφει πάντα 200 όταν το feature είναι ενεργό — δεν
/// αποκαλύπτει αν το email υπάρχει ή αν έγινε throttle.
pub async fn request(
    State(state): State<AppState>,
    AppJson(body): AppJson<RequestBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    let Some(cfg) = state.email.clone() else {
        return Err(AppError::bad_request(
            "email_login_unavailable",
            "Η σύνδεση με email δεν είναι διαθέσιμη.",
        ));
    };

    let email = normalize_email(&body.email);
    if email.is_empty() || !email.contains('@') || email.len() > 254 {
        return Err(AppError::bad_request("invalid_email", "Μη έγκυρο email."));
    }

    // Opportunistic cleanup ληγμένων tokens (κρατά τον πίνακα μικρό).
    let _ = sqlx::query("DELETE FROM login_tokens WHERE expires_at < ?")
        .bind(now_iso())
        .execute(&state.pool)
        .await;

    // Anti-bombing: αν εκδόθηκε token γι' αυτό το email < RESEND_THROTTLE πριν,
    // σιωπηλό OK (χωρίς νέο email) — δεν αποκαλύπτουμε το throttle.
    let recent: Option<String> = sqlx::query_scalar(
        "SELECT created_at FROM login_tokens WHERE email = ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&email)
    .fetch_optional(&state.pool)
    .await?;
    if let Some(created_at) = recent.as_deref().and_then(parse_iso) {
        if now() - created_at < RESEND_THROTTLE {
            return Ok(Json(json!({ "ok": true })));
        }
    }

    let token = generate_token();
    let token_hash = sha256_hex(&token);
    sqlx::query(
        "INSERT INTO login_tokens (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(&token_hash)
    .bind(&email)
    .bind(now_iso())
    .bind(iso_in(TOKEN_TTL))
    .execute(&state.pool)
    .await?;

    send_login_email(&cfg, &email, &token).await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct ConsumeBody {
    token: String,
}

/// Εξαργυρώνει το token από το email → session. Single-use & expiry-checked.
pub async fn consume(
    State(state): State<AppState>,
    headers: HeaderMap,
    AppJson(body): AppJson<ConsumeBody>,
) -> Result<Json<AuthResponse>, AppError> {
    if state.email.is_none() {
        return Err(AppError::bad_request(
            "email_login_unavailable",
            "Η σύνδεση με email δεν είναι διαθέσιμη.",
        ));
    }

    let token = body.token.trim();
    if token.is_empty() {
        return Err(AppError::bad_request("invalid_token", "Λείπει ο κωδικός."));
    }
    let token_hash = sha256_hex(token);

    // Atomic single-use & expiry check: DELETE only succeeds if token exists AND not expired.
    // Two concurrent attempts to consume the same token cannot both succeed.
    let row: Option<String> =
        sqlx::query_scalar("DELETE FROM login_tokens WHERE token_hash = ? AND expires_at > ? RETURNING email")
            .bind(&token_hash)
            .bind(now_iso())
            .fetch_optional(&state.pool)
            .await?;

    let Some(email) = row else {
        // Distinguish between expired and missing/already-used by checking if record exists at all
        let maybe_expired: Option<String> = sqlx::query_scalar(
            "SELECT email FROM login_tokens WHERE token_hash = ? AND expires_at <= ?",
        )
            .bind(&token_hash)
            .bind(now_iso())
            .fetch_optional(&state.pool)
            .await?;

        if maybe_expired.is_some() {
            return Err(AppError::bad_request(
                "expired_token",
                "Ο σύνδεσμος έληξε. Ζήτησε νέον.",
            ));
        }

        return Err(AppError::bad_request(
            "invalid_token",
            "Άκυρος ή ήδη χρησιμοποιημένος σύνδεσμος.",
        ));
    };

    let account = find_or_create_account(&state, &email, "email").await?;
    let user_agent = headers.get(header::USER_AGENT).and_then(|v| v.to_str().ok());
    let resp = issue_auth_response(&state, &account.id, user_agent).await?;
    Ok(Json(resp))
}

/// Στέλνει το login email (plain + HTML) μέσω STARTTLS SMTP relay.
async fn send_login_email(cfg: &EmailConfig, to: &str, token: &str) -> Result<(), AppError> {
    // Το token μπαίνει στο URL fragment (#magic=…), ΟΧΙ στο query — τα
    // fragments δεν φεύγουν ποτέ στον server/proxy, οπότε δεν καταγράφονται
    // σε access logs (ίδια υγιεινή με το OAuth #oauth=… redirect).
    let link = format!(
        "{}/#magic={}",
        cfg.public_url.trim_end_matches('/'),
        token
    );

    let from: Mailbox = cfg
        .from
        .parse()
        .map_err(|_| AppError::internal("Άκυρο SMTP from address."))?;
    let to_mbox: Mailbox = to
        .parse()
        .map_err(|_| AppError::bad_request("invalid_email", "Μη έγκυρο email."))?;

    let text = format!(
        "Σύνδεση στο Anabasis\n\nΆνοιξε αυτόν τον σύνδεσμο για να συνδεθείς \
         (λήγει σε 15 λεπτά):\n{link}\n\nΑν δεν το ζήτησες εσύ, αγνόησέ το.\n"
    );
    let html = format!(
        "<div style=\"font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:auto\">\
         <h2 style=\"margin:0 0 8px\">Σύνδεση στο Anabasis</h2>\
         <p>Πάτησε για να συνδεθείς — ο σύνδεσμος λήγει σε 15 λεπτά:</p>\
         <p><a href=\"{link}\" style=\"display:inline-block;padding:10px 18px;\
         background:#111;color:#fff;text-decoration:none;border-radius:8px\">Σύνδεση</a></p>\
         <p style=\"color:#666;font-size:13px;word-break:break-all\">Ή αντίγραψε: {link}</p>\
         <p style=\"color:#999;font-size:12px\">Αν δεν το ζήτησες εσύ, αγνόησέ το.</p></div>"
    );

    let message = Message::builder()
        .from(from)
        .to(to_mbox)
        .subject("Ο σύνδεσμος σύνδεσης στο Anabasis")
        .multipart(MultiPart::alternative_plain_html(text, html))
        .map_err(|e| AppError::internal(format!("Αποτυχία σύνθεσης email: {e}")))?;

    let creds = Credentials::new(cfg.username.clone(), cfg.password.clone());
    let mailer: AsyncSmtpTransport<Tokio1Executor> =
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&cfg.host)
            .map_err(|e| AppError::internal(format!("SMTP relay error: {e}")))?
            .port(cfg.port)
            .credentials(creds)
            .build();

    mailer
        .send(message)
        .await
        .map_err(|e| AppError::internal(format!("Αποτυχία αποστολής email: {e}")))?;
    Ok(())
}
