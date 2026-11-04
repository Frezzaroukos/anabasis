use crate::auth::{generate_token, sha256_hex};
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use time::Duration as TimeDuration;
use uuid::Uuid;

use crate::app::AppState;
use crate::auth::AdminUser;
use crate::error::AppError;
use crate::json::AppJson;
use crate::util::{format_iso, now, parse_iso};

#[derive(Serialize, sqlx::FromRow)]
pub struct AdminUserRow {
    id: String,
    email: String,
    role: String,
    disabled: bool,
    created_at: String,
    last_sync_at: Option<String>,
    row_count: i64,
    /// Ενεργά (μη ληγμένα) sessions = πόσες συσκευές είναι συνδεδεμένες τώρα.
    sessions: i64,
    auth_provider: Option<String>,
    password_set: bool,
    plan: String,
    plan_expires_at: Option<String>,
    plan_active: bool,
}

pub async fn list_users(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<impl IntoResponse, AppError> {
    // Τα timestamps είναι RFC3339 UTC με κλάσματα δευτερολέπτου και στις δύο
    // πλευρές (util::iso_in / util::now_iso), οπότε η λεξικογραφική σύγκριση
    // ταυτίζεται με τη χρονική. Είναι μετρητής οθόνης, όχι auth απόφαση — η
    // πραγματική λήξη ελέγχεται με parse_iso στο auth.rs.
    let rows = sqlx::query_as::<_, AdminUserRow>(
        "SELECT a.id, a.email, a.role, a.disabled, a.created_at, a.last_sync_at,
                (SELECT COUNT(*) FROM sync_rows sr WHERE sr.account_id = a.id) AS row_count,
                (SELECT COUNT(*) FROM sessions s
                  WHERE s.account_id = a.id AND s.expires_at > ?1) AS sessions,
                a.auth_provider, a.password_set, a.plan, a.plan_expires_at,
                CASE WHEN a.plan = 'pro'
                      AND (a.plan_expires_at IS NULL OR a.plan_expires_at > ?1)
                     THEN 1 ELSE 0 END AS plan_active
         FROM accounts a ORDER BY a.created_at",
    )
    .bind(crate::util::now_iso())
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct TableBreakdownRow {
    tbl: String,
    row_count: i64,
    deleted_count: i64,
}

/// GET /api/admin/users/{id}/rows — ανάλυση των sync_rows ενός λογαριασμού ανά
/// πίνακα. Ο συνολικός αριθμός στη λίστα λέει «πόσα», αυτό λέει «τι» — η μόνη
/// πληροφορία που δείχνει αν το sync ενός χρήστη είναι όντως υγιές ή αν λείπει
/// ολόκληρη κατηγορία δεδομένων.
pub async fn user_rows(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    // Χωρίς αυτό, ένα λάθος id θα έδειχνε «άδειος χρήστης» αντί για «δεν υπάρχει».
    let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM accounts WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;
    if exists.is_none() {
        return Err(AppError::not_found());
    }

    let rows = sqlx::query_as::<_, TableBreakdownRow>(
        "SELECT tbl,
                COUNT(*) AS row_count,
                COALESCE(SUM(deleted), 0) AS deleted_count
         FROM sync_rows WHERE account_id = ?
         GROUP BY tbl ORDER BY row_count DESC, tbl",
    )
    .bind(&id)
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
    admin: AdminUser,
    Path(id): Path<String>,
    AppJson(body): AppJson<DisableRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Δύο guards πριν αγγίξουμε τη βάση — και οι δύο μόνο στο disable, ποτέ
    // στο re-enable (πάντα ασφαλές):
    if body.disabled {
        // (1) Ποτέ τον δικό σου λογαριασμό — αυτό θα σε αποσύνδεε ΑΜΕΣΩΣ
        // (disable σκοτώνει sessions) χωρίς κανέναν άλλον admin να το
        // αναστρέψει αν έτυχε να είσαι ο μοναδικός.
        if id == admin.0.account_id {
            return Err(AppError::bad_request(
                "self_disable",
                "Δεν μπορείς να απενεργοποιήσεις τον δικό σου λογαριασμό.",
            ));
        }

        // (2) Ποτέ τον ΤΕΛΕΥΤΑΙΟ ενεργό admin. Σήμερα αυτό συμπίπτει πάντα με
        // το (1) — ο ενεργών είναι ΠΑΝΤΑ ένας ενεργός admin (το εγγυάται ο
        // AdminUser extractor) και κανένα άλλο endpoint δεν αφαιρεί admins,
        // οπότε disable σε ΑΛΛΟΝ admin δεν αδειάζει ποτέ τη λίστα. Μένει ως
        // explicit invariant/defense-in-depth για μελλοντικά admin-management
        // endpoints (π.χ. demote/delete) που ίσως δεν περάσουν από εδώ.
        let target_role: Option<String> =
            sqlx::query_scalar("SELECT role FROM accounts WHERE id = ?")
                .bind(&id)
                .fetch_optional(&state.pool)
                .await?;
        let Some(target_role) = target_role else {
            return Err(AppError::not_found());
        };
        if target_role == "admin" {
            let active_admins: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM accounts WHERE role = 'admin' AND disabled = 0",
            )
            .fetch_one(&state.pool)
            .await?;
            if active_admins <= 1 {
                return Err(AppError::bad_request(
                    "last_admin",
                    "Δεν μπορείς να απενεργοποιήσεις τον τελευταίο ενεργό διαχειριστή.",
                ));
            }
        }
    }

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

#[derive(Deserialize)]
pub struct PlanRequest {
    plan: String,
    /// Μόνο για `pro`: πόσες μέρες ισχύει. Default 60, clamp 1..=3650.
    days: Option<i64>,
    /// `pro` χωρίς expiry — δίνεται ρητά, δεν είναι το default.
    #[serde(default)]
    indefinite: Option<bool>,
}

/// POST /api/admin/users/{id}/plan — χειροκίνητη παροχή/ανάκληση Pro.
/// Χρήσιμο για δώρα, δοκιμές και support πριν μπει αυτόματο billing.
#[derive(Deserialize)]
pub struct CompCodeRequest {
    /// 1..3650 όταν δεν είναι indefinite.
    days: Option<i64>,
    #[serde(default)]
    indefinite: Option<bool>,
}

#[derive(Serialize)]
pub struct CompCodeResponse {
    id: String,
    code: String,
    code_prefix: String,
    days: Option<i64>,
    indefinite: bool,
    max_uses: i64,
}

/// POST /api/admin/comp_codes — δημιουργεί one-time access code. Το plaintext
/// επιστρέφεται ΜΟΝΟ εδώ· η βάση κρατά μόνο SHA-256. Admin-only.
pub async fn create_comp_code(
    State(state): State<AppState>,
    admin: AdminUser,
    AppJson(body): AppJson<CompCodeRequest>,
) -> Result<impl IntoResponse, AppError> {
    let indefinite = body.indefinite.unwrap_or(false);
    let days = if indefinite {
        None
    } else {
        Some(body.days.unwrap_or(60).clamp(1, 3650))
    };
    // 256-bit random code; `ANB-` makes it easy to recognize/paste.
    let code = format!("ANB-{}", generate_token());
    let code_hash = sha256_hex(&code);
    let code_prefix: String = code.chars().take(12).collect();
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO comp_codes
             (id, code_hash, code_prefix, days, indefinite, max_uses, uses, created_by, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, 0, ?6, ?7)",
    )
    .bind(&id)
    .bind(&code_hash)
    .bind(&code_prefix)
    .bind(days)
    .bind(if indefinite { 1 } else { 0 })
    .bind(&admin.0.account_id)
    .bind(crate::util::now_iso())
    .execute(&state.pool)
    .await?;
    Ok(Json(CompCodeResponse {
        id,
        code,
        code_prefix,
        days,
        indefinite,
        max_uses: 1,
    }))
}

pub async fn set_plan(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
    AppJson(body): AppJson<PlanRequest>,
) -> Result<impl IntoResponse, AppError> {
    let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM accounts WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;
    if exists.is_none() {
        return Err(AppError::not_found());
    }

    match body.plan.as_str() {
        "free" => {
            sqlx::query(
                "UPDATE accounts SET plan = 'free', plan_expires_at = NULL, plan_source = 'admin' WHERE id = ?",
            )
            .bind(&id)
            .execute(&state.pool)
            .await?;
        }
        "pro" => {
            let expires_at = if body.indefinite == Some(true) {
                None
            } else {
                let days = body.days.unwrap_or(60).clamp(1, 3650);
                let current: Option<String> =
                    sqlx::query_scalar("SELECT plan_expires_at FROM accounts WHERE id = ?")
                        .bind(&id)
                        .fetch_one(&state.pool)
                        .await?;
                let base = current
                    .as_deref()
                    .and_then(parse_iso)
                    .filter(|until| *until > now())
                    .unwrap_or_else(now);
                Some(format_iso(base + TimeDuration::days(days)))
            };
            sqlx::query(
                "UPDATE accounts SET plan = 'pro', plan_expires_at = ?, plan_source = 'admin' WHERE id = ?",
            )
            .bind(&expires_at)
            .bind(&id)
            .execute(&state.pool)
            .await?;
        }
        _ => {
            return Err(AppError::bad_request(
                "invalid_plan",
                "Το plan πρέπει να είναι 'free' ή 'pro'.",
            ));
        }
    }

    let (plan, plan_expires_at): (String, Option<String>) =
        sqlx::query_as("SELECT plan, plan_expires_at FROM accounts WHERE id = ?")
            .bind(&id)
            .fetch_one(&state.pool)
            .await?;
    Ok(Json(serde_json::json!({
        "plan": plan,
        "plan_expires_at": plan_expires_at,
        "plan_active": crate::auth::plan_is_active(&plan, plan_expires_at.as_deref()),
    })))
}

#[derive(Serialize)]
pub struct StatsResponse {
    accounts: i64,
    active_accounts: i64,
    disabled_accounts: i64,
    admins: i64,
    pro_accounts: i64,
    /// Ενεργά sessions συνολικά — «πόσες συσκευές είναι συνδεδεμένες τώρα».
    sessions: i64,
    rows: i64,
    /// `null` όταν το αρχείο δεν διαβάζεται· ΟΧΙ ψεύτικο 0 (no fake data).
    db_size_bytes: Option<i64>,
    uptime_seconds: i64,
}

/// Μέγεθος βάσης = main + `-wal` + `-shm`.
///
/// Τρέχουμε σε WAL mode (db.rs), οπότε το σκέτο main αρχείο ΥΠΟΤΙΜΑ: το WAL
/// κρατά τις πρόσφατες εγγραφές —συχνά πολλά MB— μέχρι το επόμενο checkpoint.
/// Αν δεν διαβάζεται καν το main, γυρνάμε `None`: καλύτερα «—» παρά ψευδές 0.
fn measure_db_size(db_path: &std::path::Path) -> Option<i64> {
    let main = std::fs::metadata(db_path).ok()?.len() as i64;
    let sidecars: i64 = ["-wal", "-shm"]
        .iter()
        .filter_map(|suffix| {
            let mut path = db_path.as_os_str().to_os_string();
            path.push(suffix);
            std::fs::metadata(std::path::PathBuf::from(path)).ok()
        })
        .map(|meta| meta.len() as i64)
        .sum();
    Some(main + sidecars)
}

/// Ελάχιστο ασφαλές horizon για tombstone GC. Κόβει την πιθανότητα να
/// αφαιρέσουμε tombstone που ένας offline client δεν έχει δει ακόμα — δες
/// `sync::prune_tombstones`. Ένας admin δεν μπορεί να κατεβάσει το horizon
/// κάτω από αυτό (clamp), όσο κι αν το ζητήσει το body.
const MIN_GC_HORIZON_DAYS: i64 = 7;
const DEFAULT_GC_HORIZON_DAYS: i64 = 90;

#[derive(Deserialize, Default)]
pub struct GcQuery {
    /// Πόσων ημερών tombstones να κρατηθούν· default 90, clamp ελάχιστο 7.
    /// Δίνεται ως query param: `POST /api/admin/gc?horizon_days=30`.
    horizon_days: Option<i64>,
}

#[derive(Serialize)]
pub struct GcResponse {
    pruned: u64,
    horizon_days: i64,
}

/// POST /api/admin/gc — χειροκίνητο tombstone garbage-collection. Additive,
/// admin-gated, idempotent. Δεν αγγίζει ζωντανά rows (μόνο `deleted = 1`) και
/// είναι cursor/epoch-safe (δες `sync::prune_tombstones`).
pub async fn gc(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(q): Query<GcQuery>,
) -> Result<impl IntoResponse, AppError> {
    let requested = q.horizon_days.unwrap_or(DEFAULT_GC_HORIZON_DAYS);
    let horizon_days = requested.max(MIN_GC_HORIZON_DAYS);

    let pruned = crate::sync::prune_tombstones(&state.pool, horizon_days).await?;
    tracing::info!(pruned, horizon_days, "admin tombstone GC");

    Ok(Json(GcResponse {
        pruned,
        horizon_days,
    }))
}

#[derive(Deserialize, Default)]
pub struct ReportsQuery {
    /// `open` | `reviewed` | `dismissed` — ή `all`/απόν για όλα.
    status: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct AdminReportRow {
    id: String,
    reporter_id: String,
    reporter_username: Option<String>,
    target_account_id: String,
    target_username: String,
    reason: String,
    note: Option<String>,
    status: String,
    created_at: String,
    reviewed_at: Option<String>,
    reviewer_id: Option<String>,
}

/// GET /api/admin/reports — η ουρά manual moderation. Χωρίς status φίλτρο
/// επιστρέφει τα πρόσφατα με τα `open` πρώτα· με `status=` φιλτράρει αυστηρά.
/// Δεν αλλάζει καμία κατάσταση — η απόφαση μένει στον άνθρωπο admin.
pub async fn reports(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(q): Query<ReportsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let status = match q.status.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        None | Some("all") => None,
        Some(s @ ("open" | "reviewed" | "dismissed")) => Some(s),
        Some(_) => {
            return Err(AppError::bad_request(
                "invalid_status",
                "Το status πρέπει να είναι 'open', 'reviewed', 'dismissed' ή 'all'.",
            ))
        }
    };

    let rows = sqlx::query_as::<_, AdminReportRow>(
        "SELECT r.id, r.reporter_id, ra.username AS reporter_username,
                r.target_account_id, r.target_username, r.reason, r.note, r.status,
                r.created_at, r.reviewed_at, r.reviewer_id
         FROM reports r
         LEFT JOIN accounts ra ON ra.id = r.reporter_id
         WHERE (?1 IS NULL OR r.status = ?1)
         ORDER BY CASE WHEN r.status = 'open' THEN 0 ELSE 1 END, r.created_at DESC
         LIMIT 200",
    )
    .bind(status)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

pub async fn stats(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<impl IntoResponse, AppError> {
    // Ένα query για τους λογαριασμούς αντί για τέσσερα σαρώματα του πίνακα.
    let (accounts, disabled_accounts, admins): (i64, i64, i64) = sqlx::query_as(
        "SELECT COUNT(*),
                COALESCE(SUM(disabled), 0),
                COALESCE(SUM(role = 'admin'), 0)
         FROM accounts",
    )
    .fetch_one(&state.pool)
    .await?;
    let sessions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE expires_at > ?")
        .bind(crate::util::now_iso())
        .fetch_one(&state.pool)
        .await?;
    let pro_accounts: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM accounts
         WHERE plan = 'pro' AND (plan_expires_at IS NULL OR plan_expires_at > ?)",
    )
    .bind(crate::util::now_iso())
    .fetch_one(&state.pool)
    .await?;
    let rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sync_rows")
        .fetch_one(&state.pool)
        .await?;
    let uptime_seconds = (now() - state.started_at).whole_seconds().max(0);

    Ok(Json(StatsResponse {
        accounts,
        active_accounts: accounts - disabled_accounts,
        disabled_accounts,
        admins,
        pro_accounts,
        sessions,
        rows,
        db_size_bytes: measure_db_size(&state.db_path),
        uptime_seconds,
    }))
}
