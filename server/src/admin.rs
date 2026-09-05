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
    /// Ενεργά (μη ληγμένα) sessions = πόσες συσκευές είναι συνδεδεμένες τώρα.
    sessions: i64,
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
                  WHERE s.account_id = a.id AND s.expires_at > ?) AS sessions
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
        let target_role: Option<String> = sqlx::query_scalar("SELECT role FROM accounts WHERE id = ?")
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

#[derive(Serialize)]
pub struct StatsResponse {
    accounts: i64,
    active_accounts: i64,
    disabled_accounts: i64,
    admins: i64,
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
    let rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sync_rows")
        .fetch_one(&state.pool)
        .await?;
    let uptime_seconds = (now() - state.started_at).whole_seconds().max(0);

    Ok(Json(StatsResponse {
        accounts,
        active_accounts: accounts - disabled_accounts,
        disabled_accounts,
        admins,
        sessions,
        rows,
        db_size_bytes: measure_db_size(&state.db_path),
        uptime_seconds,
    }))
}
