//! Stripe one-time checkout + webhook.
//!
//! Dormant by default: without all of `ANABASIS_STRIPE_SECRET_KEY`,
//! `ANABASIS_STRIPE_PRICE_ID`, and `ANABASIS_STRIPE_WEBHOOK_SECRET`, checkout
//! returns 503 and the UI shows "upgrade coming soon". The webhook is the only
//! place that grants a paid plan automatically; the admin endpoint remains for
//! gifts/support. No secret value is ever logged.

use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use hmac::{Hmac, KeyInit, Mac};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::Sha256;
use time::Duration as TimeDuration;

use crate::app::AppState;
use crate::auth::AuthUser;
use crate::error::AppError;
use crate::util::{constant_time_eq, format_iso, now, now_iso, parse_iso};

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone)]
pub struct BillingConfig {
    pub secret_key: String,
    pub price_id: String,
    pub webhook_secret: String,
    pub public_url: String,
    pub price_label: Option<String>,
    pub days: i64,
}

impl BillingConfig {
    /// Pure over an env-style lookup so tests don't mutate global env.
    pub fn resolve(get: impl Fn(&str) -> Option<String>) -> Option<Self> {
        let pick = |key: &str| -> Option<String> {
            get(key)
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
        };
        let secret_key = pick("ANABASIS_STRIPE_SECRET_KEY")?;
        let price_id = pick("ANABASIS_STRIPE_PRICE_ID")?;
        let webhook_secret = pick("ANABASIS_STRIPE_WEBHOOK_SECRET")?;
        let public_url =
            pick("ANABASIS_PUBLIC_URL").unwrap_or_else(|| "https://anabasis.axonos.dev".into());
        let days = pick("ANABASIS_STRIPE_DAYS")
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(60)
            .clamp(1, 3650);
        Some(Self {
            secret_key,
            price_id,
            webhook_secret,
            public_url,
            price_label: pick("ANABASIS_STRIPE_PRICE_LABEL"),
            days,
        })
    }
}

#[derive(Serialize)]
pub struct BillingConfigResponse {
    enabled: bool,
    price_label: Option<String>,
    days: i64,
}

pub async fn config(State(state): State<AppState>) -> Json<BillingConfigResponse> {
    match state.billing.as_ref() {
        Some(cfg) => Json(BillingConfigResponse {
            enabled: true,
            price_label: cfg.price_label.clone(),
            days: cfg.days,
        }),
        None => Json(BillingConfigResponse {
            enabled: false,
            price_label: None,
            days: 60,
        }),
    }
}

fn require_config(state: &AppState) -> Result<&BillingConfig, AppError> {
    state.billing.as_ref().ok_or_else(|| {
        AppError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "billing_not_configured",
            "Οι πληρωμές δεν είναι ενεργοποιημένες σε αυτόν τον server.",
        )
    })
}

/// POST /api/billing/checkout — authenticated; returns a Stripe Checkout URL.
/// The plan is granted only by the webhook, never by this response.
pub async fn checkout(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<impl IntoResponse, AppError> {
    let cfg = require_config(&state)?;
    let email: String = sqlx::query_scalar("SELECT email FROM accounts WHERE id = ?")
        .bind(&auth.account_id)
        .fetch_one(&state.pool)
        .await?;

    let base = cfg.public_url.trim_end_matches('/');
    let success_url = format!("{base}/settings/account?billing=success");
    let cancel_url = format!("{base}/settings/account?billing=cancel");
    let days = cfg.days.to_string();
    let params = [
        ("mode", "payment"),
        ("success_url", success_url.as_str()),
        ("cancel_url", cancel_url.as_str()),
        ("client_reference_id", auth.account_id.as_str()),
        ("customer_email", email.as_str()),
        ("line_items[0][price]", cfg.price_id.as_str()),
        ("line_items[0][quantity]", "1"),
        ("metadata[account_id]", auth.account_id.as_str()),
        ("metadata[days]", days.as_str()),
    ];

    let res = state
        .http_client
        .post("https://api.stripe.com/v1/checkout/sessions")
        .bearer_auth(&cfg.secret_key)
        .form(&params)
        .send()
        .await
        .map_err(|err| {
            tracing::error!(error = %err, "stripe checkout request failed");
            AppError::new(
                StatusCode::BAD_GATEWAY,
                "billing_provider_error",
                "Δεν μπόρεσα να ξεκινήσω την πληρωμή. Δοκίμασε ξανά.",
            )
        })?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        tracing::error!(%status, body = %body, "stripe checkout rejected");
        return Err(AppError::new(
            StatusCode::BAD_GATEWAY,
            "billing_provider_error",
            "Η πληρωμή δεν ξεκίνησε. Δοκίμασε ξανά.",
        ));
    }

    let body: Value = res.json().await.map_err(|err| {
        tracing::error!(error = %err, "stripe checkout returned non-json");
        AppError::new(
            StatusCode::BAD_GATEWAY,
            "billing_provider_error",
            "Μη αναμενόμενη απάντηση από την πληρωμή.",
        )
    })?;
    let url = body["url"].as_str().ok_or_else(|| {
        AppError::new(
            StatusCode::BAD_GATEWAY,
            "billing_provider_error",
            "Η πληρωμή δεν επέστρεψε σύνδεσμο.",
        )
    })?;

    Ok(Json(json!({ "url": url })))
}

/// POST /api/billing/webhook — Stripe signature verified over the RAW body.
/// `checkout.session.completed` with `payment_status=paid` grants `pro` for the
/// purchased number of days. Event ids are idempotent.
pub async fn stripe_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, AppError> {
    let cfg = require_config(&state)?;
    let signature = headers
        .get("stripe-signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    if !verify_signature(
        signature,
        &body,
        &cfg.webhook_secret,
        now().unix_timestamp(),
    ) {
        return Err(AppError::bad_request(
            "invalid_signature",
            "Μη έγκυρη υπογραφή webhook.",
        ));
    }

    let event: Value = serde_json::from_slice(&body)
        .map_err(|_| AppError::bad_request("invalid_payload", "Μη έγκυρο σώμα webhook."))?;
    if event["type"] != "checkout.session.completed" {
        return Ok(Json(json!({ "received": true })));
    }

    let session = &event["data"]["object"];
    if session["payment_status"] != "paid" {
        return Ok(Json(json!({ "received": true })));
    }
    let account_id = session["client_reference_id"]
        .as_str()
        .or_else(|| session["metadata"]["account_id"].as_str())
        .ok_or_else(|| AppError::bad_request("missing_account", "Λείπει ο λογαριασμός."))?;
    let event_id = event["id"]
        .as_str()
        .filter(|id| !id.is_empty())
        .ok_or_else(|| AppError::bad_request("missing_event_id", "Λείπει το event id."))?;
    let days = session["metadata"]["days"]
        .as_str()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(cfg.days)
        .clamp(1, 3650);

    apply_paid_plan(
        &state.pool,
        account_id,
        days,
        event_id,
        session["id"].as_str(),
        session["amount_total"].as_i64(),
        session["currency"].as_str(),
    )
    .await?;

    Ok(Json(json!({ "received": true })))
}

#[allow(clippy::too_many_arguments)]
async fn apply_paid_plan(
    pool: &sqlx::SqlitePool,
    account_id: &str,
    days: i64,
    event_id: &str,
    session_id: Option<&str>,
    amount_total: Option<i64>,
    currency: Option<&str>,
) -> Result<bool, AppError> {
    let current: Option<String> =
        sqlx::query_scalar("SELECT COALESCE(plan_expires_at, '') FROM accounts WHERE id = ?")
            .bind(account_id)
            .fetch_optional(pool)
            .await?;
    let Some(current) = current else {
        // Stripe can send a stale event for a deleted account; acknowledge it.
        tracing::warn!(account_id, "stripe event for missing account");
        return Ok(false);
    };

    let base = parse_iso(&current)
        .filter(|until| *until > now())
        .unwrap_or_else(now);
    let expires_at = format_iso(base + TimeDuration::days(days));

    let mut tx = pool.begin().await?;
    let inserted = sqlx::query(
        "INSERT OR IGNORE INTO billing_events
         (event_id, account_id, provider, session_id, amount_total, currency, days, created_at)
         VALUES (?, ?, 'stripe', ?, ?, ?, ?, ?)",
    )
    .bind(event_id)
    .bind(account_id)
    .bind(session_id)
    .bind(amount_total)
    .bind(currency)
    .bind(days)
    .bind(now_iso())
    .execute(&mut *tx)
    .await?
    .rows_affected();

    if inserted == 0 {
        tx.rollback().await?;
        return Ok(false);
    }

    sqlx::query(
        "UPDATE accounts SET plan = 'pro', plan_expires_at = ?, plan_source = 'stripe' WHERE id = ?",
    )
    .bind(&expires_at)
    .bind(account_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(true)
}

/// `Stripe-Signature: t=<unix>,v1=<hex>,...`; HMAC-SHA256 over `t.body`.
/// Rejects timestamps older/newer than 5 minutes (replay window).
fn verify_signature(header: &str, body: &[u8], secret: &str, now_ts: i64) -> bool {
    let mut timestamp: Option<i64> = None;
    let mut signatures: Vec<&str> = Vec::new();
    for part in header.split(',') {
        let Some((key, value)) = part.trim().split_once('=') else {
            continue;
        };
        match key {
            "t" => timestamp = value.parse::<i64>().ok(),
            "v1" => signatures.push(value),
            _ => {}
        }
    }
    let Some(timestamp) = timestamp else {
        return false;
    };
    if (now_ts - timestamp).abs() > 300 {
        return false;
    }

    let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
        Ok(mac) => mac,
        Err(_) => return false,
    };
    mac.update(format!("{timestamp}.").as_bytes());
    mac.update(body);
    let expected = hex(&mac.finalize().into_bytes());
    signatures
        .iter()
        .any(|sig| constant_time_eq(expected.as_bytes(), sig.as_bytes()))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sign(secret: &str, timestamp: i64, body: &[u8]) -> String {
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(format!("{timestamp}.").as_bytes());
        mac.update(body);
        hex(&mac.finalize().into_bytes())
    }

    #[test]
    fn accepts_valid_signature_and_rejects_tampering() {
        let secret = "whsec_test";
        let body = br#"{"id":"evt_1","type":"checkout.session.completed"}"#;
        let timestamp = 1_700_000_000;
        let header = format!("t={timestamp},v1={}", sign(secret, timestamp, body));
        assert!(verify_signature(&header, body, secret, timestamp));
        assert!(!verify_signature(
            &header,
            br#"{"id":"evt_2"}"#,
            secret,
            timestamp
        ));
        assert!(!verify_signature(&header, body, "wrong", timestamp));
    }

    #[test]
    fn rejects_stale_or_missing_timestamp() {
        let secret = "whsec_test";
        let body = b"{}";
        let timestamp = 1_700_000_000;
        let header = format!("t={timestamp},v1={}", sign(secret, timestamp, body));
        assert!(!verify_signature(&header, body, secret, timestamp + 301));
        assert!(!verify_signature("v1=deadbeef", body, secret, timestamp));
    }
}
