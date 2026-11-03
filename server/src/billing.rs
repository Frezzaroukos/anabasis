//! Stripe billing: monthly subscription + lifetime purchases.
//!
//! Dormant by default: without `ANABASIS_STRIPE_SECRET_KEY`,
//! `ANABASIS_STRIPE_WEBHOOK_SECRET`, and at least one price id, checkout
//! returns 503 and the UI shows "upgrade coming soon". The webhook is the only
//! place that grants a paid plan automatically; the admin endpoint remains for
//! gifts/support. No secret value is ever logged.

use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::Sha256;
use time::{Duration as TimeDuration, OffsetDateTime};

use crate::app::AppState;
use crate::auth::{plan_is_active, AuthUser};
use crate::error::AppError;
use crate::json::AppJson;
use crate::util::{constant_time_eq, format_iso, now, now_iso, parse_iso};

type HmacSha256 = Hmac<Sha256>;

fn format_unix_iso(seconds: i64) -> String {
    OffsetDateTime::from_unix_timestamp(seconds)
        .map(format_iso)
        .unwrap_or_else(|_| format_iso(now()))
}

const DEFAULT_MONTHLY_DAYS: i64 = 31;
const DEFAULT_FOUNDING_LIMIT: i64 = 250;
const FOUNDING_ID: &str = "founding";
const MONTHLY_ID: &str = "monthly";
const STANDARD_ID: &str = "standard";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlanKind {
    Subscription,
    Lifetime,
}

impl PlanKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Subscription => "subscription",
            Self::Lifetime => "lifetime",
        }
    }
}

#[derive(Debug, Clone)]
pub struct PlanConfig {
    pub id: String,
    pub price_id: String,
    pub kind: PlanKind,
    pub amount: i64,
    pub price_label: String,
    pub days: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct BillingConfig {
    pub secret_key: String,
    pub webhook_secret: String,
    pub public_url: String,
    pub plans: Vec<PlanConfig>,
    pub legacy_days: i64,
    pub founding_limit: i64,
    pub price_label: Option<String>,
}

impl BillingConfig {
    /// Pure over an env-style lookup so tests don't mutate global env.
    pub fn resolve(get: impl Fn(&str) -> Option<String>) -> Option<Self> {
        let pick = |key: &str| -> Option<String> {
            get(key)
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
        };
        let amount = |key: &str, default: i64| -> i64 {
            pick(key)
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(default)
                .clamp(1, 1_000_000)
        };

        let secret_key = pick("ANABASIS_STRIPE_SECRET_KEY")?;
        let webhook_secret = pick("ANABASIS_STRIPE_WEBHOOK_SECRET")?;
        let public_url =
            pick("ANABASIS_PUBLIC_URL").unwrap_or_else(|| "https://anabasis.axonos.dev".into());
        let legacy_days = pick("ANABASIS_STRIPE_DAYS")
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(DEFAULT_MONTHLY_DAYS)
            .clamp(1, 3650);
        let founding_limit = pick("ANABASIS_STRIPE_FOUNDING_LIMIT")
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(DEFAULT_FOUNDING_LIMIT)
            .clamp(1, 10_000);

        let mut plans = Vec::new();
        if let Some(price_id) =
            pick("ANABASIS_STRIPE_PRICE_MONTHLY").or_else(|| pick("ANABASIS_STRIPE_PRICE_ID"))
        {
            plans.push(PlanConfig {
                id: MONTHLY_ID.into(),
                price_id,
                kind: PlanKind::Subscription,
                amount: amount("ANABASIS_STRIPE_AMOUNT_MONTHLY", 1099),
                price_label: pick("ANABASIS_STRIPE_LABEL_MONTHLY")
                    .unwrap_or_else(|| "€10.99 / month".into()),
                days: Some(DEFAULT_MONTHLY_DAYS),
            });
        }
        if let Some(price_id) = pick("ANABASIS_STRIPE_PRICE_FOUNDING") {
            plans.push(PlanConfig {
                id: FOUNDING_ID.into(),
                price_id,
                kind: PlanKind::Lifetime,
                amount: amount("ANABASIS_STRIPE_AMOUNT_FOUNDING", 4999),
                price_label: pick("ANABASIS_STRIPE_LABEL_FOUNDING")
                    .unwrap_or_else(|| "€49.99 once".into()),
                days: None,
            });
        }
        if let Some(price_id) = pick("ANABASIS_STRIPE_PRICE_STANDARD") {
            plans.push(PlanConfig {
                id: STANDARD_ID.into(),
                price_id,
                kind: PlanKind::Lifetime,
                amount: amount("ANABASIS_STRIPE_AMOUNT_STANDARD", 9999),
                price_label: pick("ANABASIS_STRIPE_LABEL_STANDARD")
                    .unwrap_or_else(|| "€99.99 once".into()),
                days: None,
            });
        }
        if plans.is_empty() {
            return None;
        }

        Some(Self {
            secret_key,
            webhook_secret,
            public_url,
            plans,
            legacy_days,
            founding_limit,
            price_label: pick("ANABASIS_STRIPE_PRICE_LABEL"),
        })
    }

    fn plan(&self, id: &str) -> Option<&PlanConfig> {
        self.plans.iter().find(|plan| plan.id == id)
    }
}

#[derive(Serialize)]
struct PlanResponse {
    id: String,
    kind: &'static str,
    price_label: String,
    amount: i64,
    currency: &'static str,
    days: Option<i64>,
    available: bool,
    remaining: Option<i64>,
}

#[derive(Serialize)]
pub struct BillingConfigResponse {
    enabled: bool,
    price_label: Option<String>,
    days: i64,
    plans: Vec<PlanResponse>,
    /// Public campaign cap — the landing counter uses this, not a hardcoded 250.
    founding_limit: i64,
}

pub async fn config(State(state): State<AppState>) -> Json<BillingConfigResponse> {
    let Some(cfg) = state.billing.as_ref() else {
        return Json(BillingConfigResponse {
            enabled: false,
            price_label: None,
            days: DEFAULT_MONTHLY_DAYS,
            plans: Vec::new(),
            founding_limit: 0,
        });
    };

    let sold = founding_sold(&state.pool).await.unwrap_or(0);
    let remaining = (cfg.founding_limit - sold).max(0);
    let plans = cfg
        .plans
        .iter()
        .map(|plan| {
            let is_founding = plan.id == FOUNDING_ID;
            PlanResponse {
                id: plan.id.clone(),
                kind: plan.kind.as_str(),
                price_label: plan.price_label.clone(),
                amount: plan.amount,
                currency: "eur",
                days: plan.days,
                available: !is_founding || remaining > 0,
                remaining: is_founding.then_some(remaining),
            }
        })
        .collect();

    Json(BillingConfigResponse {
        enabled: true,
        price_label: cfg
            .price_label
            .clone()
            .or_else(|| cfg.plans.first().map(|p| p.price_label.clone())),
        days: cfg.legacy_days,
        plans,
        founding_limit: cfg.founding_limit,
    })
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

#[derive(Deserialize, Default)]
pub struct CheckoutRequest {
    plan: Option<String>,
}

/// POST /api/billing/checkout — authenticated; returns a Stripe Checkout URL.
/// The plan is granted only by the webhook, never by this response.
pub async fn checkout(
    State(state): State<AppState>,
    auth: AuthUser,
    AppJson(body): AppJson<CheckoutRequest>,
) -> Result<impl IntoResponse, AppError> {
    let cfg = require_config(&state)?;
    let plan = cfg
        .plan(body.plan.as_deref().unwrap_or(MONTHLY_ID))
        .ok_or_else(|| AppError::bad_request("unknown_plan", "Άγνωστο πλάνο πληρωμής."))?;

    let current: Option<(String, Option<String>)> =
        sqlx::query_as("SELECT plan, plan_expires_at FROM accounts WHERE id = ?")
            .bind(&auth.account_id)
            .fetch_optional(&state.pool)
            .await?;
    let Some((current_plan, current_expires)) = current else {
        return Err(AppError::not_found());
    };
    let current_active = plan_is_active(&current_plan, current_expires.as_deref());
    let current_lifetime = current_active && current_expires.is_none();
    if current_lifetime || (current_active && plan.kind == PlanKind::Subscription) {
        return Err(AppError::conflict(
            "already_pro",
            "Το Pro είναι ήδη ενεργό σε αυτόν τον λογαριασμό.",
        ));
    }

    if plan.id == FOUNDING_ID {
        let sold = founding_sold(&state.pool).await?;
        if sold >= cfg.founding_limit {
            return Err(AppError::conflict(
                "founding_sold_out",
                "Η founding προσφορά έχει εξαντληθεί.",
            ));
        }
    }

    let email: String = sqlx::query_scalar("SELECT email FROM accounts WHERE id = ?")
        .bind(&auth.account_id)
        .fetch_one(&state.pool)
        .await?;

    let base = cfg.public_url.trim_end_matches('/');
    let success_url = format!("{base}/settings/account?billing=success&plan={}", plan.id);
    let cancel_url = format!("{base}/settings/account?billing=cancel");
    let days = plan.days.unwrap_or(0).to_string();
    let mut params: Vec<(String, String)> = vec![
        ("success_url".into(), success_url),
        ("cancel_url".into(), cancel_url),
        ("client_reference_id".into(), auth.account_id.clone()),
        ("customer_email".into(), email),
        ("line_items[0][price]".into(), plan.price_id.clone()),
        ("line_items[0][quantity]".into(), "1".into()),
        ("metadata[account_id]".into(), auth.account_id.clone()),
        ("metadata[plan]".into(), plan.id.clone()),
        ("metadata[days]".into(), days),
        (
            "custom_text[submit][message]".into(),
            format!("14-day withdrawal right. Refunds: {base}/legal/refund"),
        ),
    ];
    match plan.kind {
        PlanKind::Subscription => {
            params.push(("mode".into(), "subscription".into()));
            params.push((
                "subscription_data[metadata][account_id]".into(),
                auth.account_id.clone(),
            ));
            params.push(("subscription_data[metadata][plan]".into(), plan.id.clone()));
        }
        PlanKind::Lifetime => {
            params.push(("mode".into(), "payment".into()));
            // One-time Pro needs a real customer + invoice for receipts and
            // the 14-day refund record. Subscription mode does this by default.
            params.push(("customer_creation".into(), "always".into()));
            params.push(("invoice_creation[enabled]".into(), "true".into()));
        }
    }

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

#[derive(Serialize)]
pub struct BillingPortalResponse {
    url: String,
}

/// POST /api/billing/portal — authenticated; returns a Stripe Billing Portal URL.
/// The portal is only useful for recurring subscriptions: lifetime owners have
/// nothing to renew or cancel. The webhook remains the source of truth for plan
/// changes; opening the portal never grants anything by itself.
pub async fn portal(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<BillingPortalResponse>, AppError> {
    let cfg = require_config(&state)?;
    let subscription_id: Option<String> = sqlx::query_scalar(
        "SELECT subscription_id FROM billing_subscriptions
         WHERE account_id = ?
         ORDER BY CASE status
                    WHEN 'active' THEN 0
                    WHEN 'trialing' THEN 0
                    WHEN 'past_due' THEN 1
                    ELSE 2
                  END,
                  updated_at DESC, created_at DESC
         LIMIT 1",
    )
    .bind(&auth.account_id)
    .fetch_optional(&state.pool)
    .await?;
    let Some(subscription_id) = subscription_id else {
        return Err(AppError::conflict(
            "no_billing_account",
            "Δεν βρέθηκε συνδρομή Stripe για αυτόν τον λογαριασμό.",
        ));
    };

    let customer_id = subscription_customer(&state, cfg, &subscription_id).await?;
    let return_url = format!("{}/settings/account", cfg.public_url.trim_end_matches('/'));
    let res = state
        .http_client
        .post("https://api.stripe.com/v1/billing_portal/sessions")
        .bearer_auth(&cfg.secret_key)
        .form(&[
            ("customer", customer_id.as_str()),
            ("return_url", return_url.as_str()),
        ])
        .send()
        .await
        .map_err(|err| {
            tracing::error!(error = %err, "stripe portal request failed");
            AppError::new(
                StatusCode::BAD_GATEWAY,
                "billing_provider_error",
                "Δεν μπόρεσα να ανοίξω τη διαχείριση χρέωσης. Δοκίμασε ξανά.",
            )
        })?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        tracing::error!(%status, body = %body, "stripe portal rejected");
        return Err(AppError::new(
            StatusCode::BAD_GATEWAY,
            "billing_provider_error",
            "Η διαχείριση χρέωσης δεν άνοιξε. Δοκίμασε ξανά.",
        ));
    }

    let body: Value = res.json().await.map_err(|err| {
        tracing::error!(error = %err, "stripe portal returned non-json");
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
            "Η διαχείριση χρέωσης δεν επέστρεψε σύνδεσμο.",
        )
    })?;

    Ok(Json(BillingPortalResponse {
        url: url.to_string(),
    }))
}

/// POST /api/billing/webhook — Stripe signature verified over the RAW body.
/// Event ids are idempotent. Handles checkout completions, subscription
/// renewals, subscription state changes, and full refunds.
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
    let event_type = event["type"].as_str().unwrap_or_default();
    let event_id = event["id"]
        .as_str()
        .filter(|id| !id.is_empty())
        .ok_or_else(|| AppError::bad_request("missing_event_id", "Λείπει το event id."))?;
    let object = &event["data"]["object"];

    match event_type {
        "checkout.session.completed" | "checkout.session.async_payment_succeeded" => {
            handle_checkout_completed(&state, cfg, event_id, object).await?;
        }
        "invoice.paid" => {
            handle_invoice_paid(&state, event_id, object).await?;
        }
        "customer.subscription.updated" | "customer.subscription.deleted" => {
            handle_subscription_change(&state, object).await?;
        }
        "charge.refunded" => {
            handle_refund(&state, event_id, object).await?;
        }
        _ => {}
    }

    Ok(Json(json!({ "received": true })))
}

async fn handle_checkout_completed(
    state: &AppState,
    cfg: &BillingConfig,
    event_id: &str,
    session: &Value,
) -> Result<(), AppError> {
    let account_id = session["client_reference_id"]
        .as_str()
        .or_else(|| session["metadata"]["account_id"].as_str())
        .ok_or_else(|| AppError::bad_request("missing_account", "Λείπει ο λογαριασμός."))?;
    let plan_id = session["metadata"]["plan"]
        .as_str()
        .filter(|id| !id.is_empty())
        .unwrap_or("legacy");
    let is_subscription =
        session["mode"].as_str() == Some("subscription") || session["subscription"].is_string();

    if is_subscription {
        if session["status"].as_str() != Some("complete") {
            return Ok(());
        }
        let subscription_id = session["subscription"].as_str().unwrap_or_default();
        let period_end = subscription_period_end(state, cfg, subscription_id).await;
        let expires_at = period_end
            .map(format_unix_iso)
            .unwrap_or_else(|| format_iso(now() + TimeDuration::days(DEFAULT_MONTHLY_DAYS)));
        upsert_subscription(
            &state.pool,
            subscription_id,
            account_id,
            "active",
            Some(&expires_at),
        )
        .await?;
        apply_plan(
            &state.pool,
            account_id,
            MONTHLY_ID,
            PlanKind::Subscription,
            Some(&expires_at),
            event_id,
            session["id"].as_str(),
            session["amount_total"].as_i64(),
            session["currency"].as_str(),
            Some(subscription_id),
            session["payment_intent"].as_str(),
        )
        .await?;
        return Ok(());
    }

    if session["payment_status"].as_str() != Some("paid") {
        return Ok(());
    }
    let (kind, expires_at) = if plan_id == FOUNDING_ID || plan_id == STANDARD_ID {
        (PlanKind::Lifetime, None)
    } else {
        let days = session["metadata"]["days"]
            .as_str()
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(cfg.legacy_days)
            .clamp(1, 3650);
        (
            PlanKind::Subscription,
            Some(format_iso(now() + TimeDuration::days(days))),
        )
    };
    apply_plan(
        &state.pool,
        account_id,
        plan_id,
        kind,
        expires_at.as_deref(),
        event_id,
        session["id"].as_str(),
        session["amount_total"].as_i64(),
        session["currency"].as_str(),
        None,
        session["payment_intent"].as_str(),
    )
    .await?;
    if kind == PlanKind::Lifetime {
        // Fair transition: keep the already-paid month, but stop the renewal.
        cancel_active_subscriptions(state, cfg, account_id).await;
    }
    Ok(())
}

async fn handle_invoice_paid(
    state: &AppState,
    event_id: &str,
    invoice: &Value,
) -> Result<(), AppError> {
    if invoice["status"].as_str() != Some("paid") && invoice["paid"].as_bool() != Some(true) {
        return Ok(());
    }
    let subscription_id = invoice["subscription"]
        .as_str()
        .or_else(|| invoice["subscription_details"]["subscription"].as_str())
        .unwrap_or_default();
    let Some(account_id) = subscription_account(&state.pool, subscription_id).await? else {
        tracing::warn!(subscription_id, "invoice.paid for unknown subscription");
        return Ok(());
    };

    let period_end = invoice["lines"]["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|line| line["period"]["end"].as_i64())
        .max()
        .or_else(|| invoice["period_end"].as_i64());
    let expires_at = period_end
        .map(format_unix_iso)
        .unwrap_or_else(|| format_iso(now() + TimeDuration::days(DEFAULT_MONTHLY_DAYS)));
    upsert_subscription(
        &state.pool,
        subscription_id,
        &account_id,
        "active",
        Some(&expires_at),
    )
    .await?;
    apply_plan(
        &state.pool,
        &account_id,
        MONTHLY_ID,
        PlanKind::Subscription,
        Some(&expires_at),
        event_id,
        invoice["id"].as_str(),
        invoice["amount_paid"].as_i64(),
        invoice["currency"].as_str(),
        Some(subscription_id),
        invoice["payment_intent"].as_str(),
    )
    .await?;
    Ok(())
}

async fn handle_subscription_change(
    state: &AppState,
    subscription: &Value,
) -> Result<(), AppError> {
    let Some(subscription_id) = subscription["id"].as_str() else {
        return Ok(());
    };
    let status = subscription["status"].as_str().unwrap_or("unknown");
    let period_end = subscription["current_period_end"]
        .as_i64()
        .map(format_unix_iso);
    sqlx::query(
        "UPDATE billing_subscriptions
         SET status = ?, current_period_end = COALESCE(?, current_period_end), updated_at = ?
         WHERE subscription_id = ?",
    )
    .bind(status)
    .bind(period_end)
    .bind(now_iso())
    .bind(subscription_id)
    .execute(&state.pool)
    .await?;
    Ok(())
}

async fn handle_refund(state: &AppState, event_id: &str, charge: &Value) -> Result<(), AppError> {
    let amount = charge["amount"].as_i64().unwrap_or(0);
    let refunded = charge["amount_refunded"].as_i64().unwrap_or(0);
    if charge["refunded"].as_bool() != Some(true) && (amount == 0 || refunded < amount) {
        return Ok(());
    }
    let Some(payment_intent) = charge["payment_intent"].as_str() else {
        return Ok(());
    };
    let account_id: Option<String> = sqlx::query_scalar(
        "SELECT account_id FROM billing_events
         WHERE payment_intent = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
    )
    .bind(payment_intent)
    .fetch_optional(&state.pool)
    .await?;
    let Some(account_id) = account_id else {
        return Ok(());
    };

    let mut tx = state.pool.begin().await?;
    let inserted = sqlx::query(
        "INSERT OR IGNORE INTO billing_events
         (event_id, account_id, provider, session_id, amount_total, currency, days,
          plan, kind, subscription_id, payment_intent, created_at)
         VALUES (?, ?, 'stripe', ?, ?, ?, 0, 'refund', 'refund', NULL, ?, ?)",
    )
    .bind(event_id)
    .bind(&account_id)
    .bind(charge["id"].as_str())
    .bind(amount)
    .bind(charge["currency"].as_str())
    .bind(payment_intent)
    .bind(now_iso())
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if inserted == 0 {
        tx.rollback().await?;
        return Ok(());
    }
    let latest_payment: Option<String> = sqlx::query_scalar(
        "SELECT payment_intent FROM billing_events
         WHERE account_id = ? AND plan != 'refund' AND payment_intent IS NOT NULL
         ORDER BY created_at DESC, rowid DESC LIMIT 1",
    )
    .bind(&account_id)
    .fetch_optional(&mut *tx)
    .await?;
    if latest_payment.as_deref() == Some(payment_intent) {
        sqlx::query(
            "UPDATE accounts
             SET plan = 'free', plan_expires_at = NULL, plan_source = 'refund'
             WHERE id = ? AND plan_source = 'stripe'",
        )
        .bind(&account_id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn apply_plan(
    pool: &sqlx::SqlitePool,
    account_id: &str,
    plan_id: &str,
    kind: PlanKind,
    expires_at: Option<&str>,
    event_id: &str,
    session_id: Option<&str>,
    amount_total: Option<i64>,
    currency: Option<&str>,
    subscription_id: Option<&str>,
    payment_intent: Option<&str>,
) -> Result<bool, AppError> {
    let current: Option<(String, Option<String>)> =
        sqlx::query_as("SELECT plan, plan_expires_at FROM accounts WHERE id = ?")
            .bind(account_id)
            .fetch_optional(pool)
            .await?;
    let Some((current_plan, current_expires)) = current else {
        // Stripe can send a stale event for a deleted account; acknowledge it.
        tracing::warn!(account_id, "stripe event for missing account");
        return Ok(false);
    };

    let days = expires_at
        .and_then(parse_iso)
        .map(|expires| (expires - now()).whole_days().max(0))
        .unwrap_or(0);
    let mut tx = pool.begin().await?;
    let inserted = sqlx::query(
        "INSERT OR IGNORE INTO billing_events
         (event_id, account_id, provider, session_id, amount_total, currency, days,
          plan, kind, subscription_id, payment_intent, created_at)
         VALUES (?, ?, 'stripe', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(event_id)
    .bind(account_id)
    .bind(session_id)
    .bind(amount_total)
    .bind(currency)
    .bind(days)
    .bind(plan_id)
    .bind(kind.as_str())
    .bind(subscription_id)
    .bind(payment_intent)
    .bind(now_iso())
    .execute(&mut *tx)
    .await?
    .rows_affected();

    if inserted == 0 {
        tx.rollback().await?;
        return Ok(false);
    }

    let current_active = plan_is_active(&current_plan, current_expires.as_deref());
    let current_lifetime = current_active && current_expires.is_none();
    if !current_lifetime {
        match kind {
            PlanKind::Lifetime => {
                sqlx::query(
                    "UPDATE accounts
                     SET plan = 'pro', plan_expires_at = NULL, plan_source = 'stripe'
                     WHERE id = ?",
                )
                .bind(account_id)
                .execute(&mut *tx)
                .await?;
            }
            PlanKind::Subscription => {
                let current_until = current_expires.as_deref().and_then(parse_iso);
                let target = expires_at.and_then(parse_iso).unwrap_or_else(now);
                let base = current_until
                    .filter(|until| *until > now())
                    .unwrap_or_else(now);
                let final_expiry = format_iso(if target > base { target } else { base });
                sqlx::query(
                    "UPDATE accounts
                     SET plan = 'pro', plan_expires_at = ?, plan_source = 'stripe'
                     WHERE id = ?",
                )
                .bind(&final_expiry)
                .bind(account_id)
                .execute(&mut *tx)
                .await?;
            }
        }
    }
    tx.commit().await?;
    Ok(true)
}

async fn founding_sold(pool: &sqlx::SqlitePool) -> Result<i64, AppError> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM billing_events AS purchase
         WHERE purchase.plan = ? AND purchase.kind = 'lifetime'
           AND NOT EXISTS (
             SELECT 1 FROM billing_events AS refund
             WHERE refund.plan = 'refund'
               AND refund.payment_intent = purchase.payment_intent
           )",
    )
    .bind(FOUNDING_ID)
    .fetch_one(pool)
    .await?;
    Ok(count)
}

async fn subscription_account(
    pool: &sqlx::SqlitePool,
    subscription_id: &str,
) -> Result<Option<String>, AppError> {
    if subscription_id.is_empty() {
        return Ok(None);
    }
    let account_id: Option<String> = sqlx::query_scalar(
        "SELECT account_id FROM billing_subscriptions WHERE subscription_id = ?",
    )
    .bind(subscription_id)
    .fetch_optional(pool)
    .await?;
    Ok(account_id)
}

async fn upsert_subscription(
    pool: &sqlx::SqlitePool,
    subscription_id: &str,
    account_id: &str,
    status: &str,
    current_period_end: Option<&str>,
) -> Result<(), AppError> {
    if subscription_id.is_empty() {
        return Ok(());
    }
    let ts = now_iso();
    sqlx::query(
        "INSERT INTO billing_subscriptions
         (subscription_id, account_id, status, current_period_end, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(subscription_id) DO UPDATE SET
           account_id = excluded.account_id,
           status = excluded.status,
           current_period_end = COALESCE(excluded.current_period_end, billing_subscriptions.current_period_end),
           updated_at = excluded.updated_at",
    )
    .bind(subscription_id)
    .bind(account_id)
    .bind(status)
    .bind(current_period_end)
    .bind(&ts)
    .bind(&ts)
    .execute(pool)
    .await?;
    Ok(())
}

/// After a lifetime purchase, stop any recurring subscription at the end of
/// the paid period. Best-effort: the lifetime grant is already committed and a
/// provider hiccup must not fail the webhook (Stripe would retry, but the plan
/// is correct). The subscription.updated webhook will record the final state.
async fn cancel_active_subscriptions(state: &AppState, cfg: &BillingConfig, account_id: &str) {
    let ids: Vec<String> = sqlx::query_scalar(
        "SELECT subscription_id FROM billing_subscriptions
         WHERE account_id = ? AND status IN ('active','trialing','past_due','unpaid')",
    )
    .bind(account_id)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();
    for id in ids {
        let res = state
            .http_client
            .post(format!("https://api.stripe.com/v1/subscriptions/{id}"))
            .bearer_auth(&cfg.secret_key)
            .form(&[("cancel_at_period_end", "true")])
            .send()
            .await;
        match res {
            Ok(res) if !res.status().is_success() => {
                let status = res.status();
                let body = res.text().await.unwrap_or_default();
                tracing::warn!(%status, body = %body, subscription_id = %id, "stripe lifetime cancel rejected");
            }
            Err(err) => {
                tracing::warn!(error = %err, subscription_id = %id, "stripe lifetime cancel failed");
            }
            Ok(_) => {}
        }
    }
}

async fn subscription_customer(
    state: &AppState,
    cfg: &BillingConfig,
    subscription_id: &str,
) -> Result<String, AppError> {
    let res = state
        .http_client
        .get(format!(
            "https://api.stripe.com/v1/subscriptions/{subscription_id}"
        ))
        .bearer_auth(&cfg.secret_key)
        .send()
        .await
        .map_err(|err| {
            tracing::error!(error = %err, "stripe subscription lookup failed");
            AppError::new(
                StatusCode::BAD_GATEWAY,
                "billing_provider_error",
                "Δεν μπόρεσα να βρω τη συνδρομή. Δοκίμασε ξανά.",
            )
        })?;
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        tracing::error!(%status, body = %body, "stripe subscription lookup rejected");
        return Err(AppError::new(
            StatusCode::BAD_GATEWAY,
            "billing_provider_error",
            "Δεν βρέθηκε η συνδρομή στην πληρωμή.",
        ));
    }
    let body: Value = res.json().await.map_err(|err| {
        tracing::error!(error = %err, "stripe subscription returned non-json");
        AppError::new(
            StatusCode::BAD_GATEWAY,
            "billing_provider_error",
            "Μη αναμενόμενη απάντηση από την πληρωμή.",
        )
    })?;
    body["customer"]
        .as_str()
        .or_else(|| body["customer"]["id"].as_str())
        .map(str::to_string)
        .ok_or_else(|| {
            AppError::new(
                StatusCode::BAD_GATEWAY,
                "billing_provider_error",
                "Η συνδρομή δεν έχει πελάτη πληρωμής.",
            )
        })
}

async fn subscription_period_end(
    state: &AppState,
    cfg: &BillingConfig,
    subscription_id: &str,
) -> Option<i64> {
    if subscription_id.is_empty() {
        return None;
    }
    let res = state
        .http_client
        .get(format!(
            "https://api.stripe.com/v1/subscriptions/{subscription_id}"
        ))
        .bearer_auth(&cfg.secret_key)
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    let body: Value = res.json().await.ok()?;
    body["current_period_end"].as_i64()
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

    #[test]
    fn resolves_monthly_and_lifetime_plans() {
        let cfg = BillingConfig::resolve(|key| match key {
            "ANABASIS_STRIPE_SECRET_KEY" => Some("sk_test".into()),
            "ANABASIS_STRIPE_WEBHOOK_SECRET" => Some("whsec_test".into()),
            "ANABASIS_STRIPE_PRICE_MONTHLY" => Some("price_monthly".into()),
            "ANABASIS_STRIPE_PRICE_FOUNDING" => Some("price_founding".into()),
            "ANABASIS_STRIPE_PRICE_STANDARD" => Some("price_standard".into()),
            _ => None,
        })
        .unwrap();
        assert_eq!(cfg.plans.len(), 3);
        assert_eq!(cfg.plan(MONTHLY_ID).unwrap().amount, 1099);
        assert_eq!(cfg.plan(FOUNDING_ID).unwrap().amount, 4999);
        assert_eq!(cfg.plan(STANDARD_ID).unwrap().amount, 9999);
        assert_eq!(cfg.founding_limit, 250);
    }
}
