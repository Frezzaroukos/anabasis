//! Social surface — φιλίες, δημόσιο aggregate προφίλ, leaderboard («Your Ascent»).
//!
//! ΓΙΑΤΙ ξεχωριστό module αντί για sync_rows: ένα friendship συνδέει ΔΥΟ
//! account_ids· ο `sync.rs` απορρίπτει κάθε row με `user_id != auth.account_id`.
//! Άρα το social graph ΔΕΝ μπορεί ΠΟΤΕ να περάσει από το per-account LWW mirror.
//! Τα κοινωνικά endpoints είναι πίσω από `AuthUser` + sync_governor rate-limit,
//! με **SQL-enforced privacy**: leaderboard/profile views φιλτράρουν
//! `share_profile`/friendship στο SQL, ποτέ client-side. Εξαίρεση το
//! `/public/user/{username}`: είναι σκόπιμα logged-out ώστε ένα invite link να
//! ανοίγει για φίλο που δεν έχει ακόμα λογαριασμό — δείχνει ΜΟΝΟ προφίλ με
//! `share_profile=1`. Ο server είναι authoritative για level/tier/altitude (τα
//! υπολογίζει από το XP) ώστε ο client να μην μπορεί να τα φουσκώσει.

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use sqlx::AssertSqlSafe;

use crate::app::AppState;
use crate::auth::AuthUser;
use crate::error::AppError;
use crate::json::AppJson;
use crate::util::now_iso;

// ── Gamification (server-authoritative mirror του src/lib/gamification.ts) ──────
// Ο client στέλνει xp/streaks/badges· ο server ΑΓΝΟΕΙ τυχόν client level/tier και
// τα ξαναϋπολογίζει από το (clamped) xp — anti-inflation, καμία ανταμοιβή δεμένη.

const XP_MAX: i64 = 100_000_000;

/// level = floor(sqrt(xp/100)) + 1 (ίδιο με το client `levelFromXp`).
fn level_from_xp(xp: i64) -> i64 {
    if xp <= 0 {
        return 1;
    }
    ((xp as f64 / 100.0).sqrt().floor() as i64) + 1
}

/// (tier_key, altitude_m) για ένα level — ίδια κατώφλια με το client `TIERS`.
fn tier_for_level(level: i64) -> (&'static str, i64) {
    const TIERS: &[(&str, i64, i64)] = &[
        ("baseCamp", 1, 0),
        ("ridge", 5, 1200),
        ("alpine", 10, 2918),
        ("summit", 18, 4808),
        ("stratosphere", 30, 8849),
    ];
    let mut current = (TIERS[0].0, TIERS[0].2);
    for &(key, min_level, altitude) in TIERS {
        if level >= min_level {
            current = (key, altitude);
        }
    }
    current
}

/// Γνωστά badge ids — ό,τι δεν είναι εδώ πετιέται (κανένα αυθαίρετο string).
const KNOWN_BADGES: &[&str] = &[
    "first-ascent",
    "week-streak",
    "ten-sessions",
    "record-breaker",
    "first-skill",
    "century",
    "month-streak",
];

// ── Username validation ────────────────────────────────────────────────────────
// 3–20 chars, lowercase a-z 0-9 _ . Normalize σε lowercase πριν το validate/store.

fn normalize_username(raw: &str) -> Option<String> {
    let u = raw.trim().to_lowercase();
    if u.len() < 3 || u.len() > 20 {
        return None;
    }
    if !u
        .bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
    {
        return None;
    }
    Some(u)
}

// ── /api/social/me ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct MyProfile {
    username: Option<String>,
    display_name: Option<String>,
    share_profile: bool,
    friends_count: i64,
    incoming_count: i64,
    outgoing_count: i64,
    has_stats: bool,
}

pub async fn me(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<impl IntoResponse, AppError> {
    let row: (Option<String>, Option<String>, bool) =
        sqlx::query_as("SELECT username, display_name, share_profile FROM accounts WHERE id = ?")
            .bind(&user.account_id)
            .fetch_one(&state.pool)
            .await?;

    let friends_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM friendships
         WHERE status = 'accepted' AND (requester_id = ?1 OR addressee_id = ?1)",
    )
    .bind(&user.account_id)
    .fetch_one(&state.pool)
    .await?;

    let incoming_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM friendships WHERE status = 'pending' AND addressee_id = ?",
    )
    .bind(&user.account_id)
    .fetch_one(&state.pool)
    .await?;

    let outgoing_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM friendships WHERE status = 'pending' AND requester_id = ?",
    )
    .bind(&user.account_id)
    .fetch_one(&state.pool)
    .await?;

    let has_stats: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM profile_stats WHERE account_id = ?")
            .bind(&user.account_id)
            .fetch_one(&state.pool)
            .await?;

    Ok(Json(MyProfile {
        username: row.0,
        display_name: row.1,
        share_profile: row.2,
        friends_count,
        incoming_count,
        outgoing_count,
        has_stats: has_stats > 0,
    }))
}

// ── PUT /api/social/profile ────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct UpdateProfileRequest {
    /// null = μην αλλάξεις· "" = καθάρισε το username (γίνεται NULL).
    username: Option<String>,
    display_name: Option<String>,
    share_profile: Option<bool>,
}

pub async fn update_profile(
    State(state): State<AppState>,
    user: AuthUser,
    AppJson(body): AppJson<UpdateProfileRequest>,
) -> Result<impl IntoResponse, AppError> {
    if let Some(ref raw) = body.username {
        if raw.trim().is_empty() {
            // Καθάρισε το handle → NULL (partial index επιτρέπει πολλά NULL).
            sqlx::query("UPDATE accounts SET username = NULL WHERE id = ?")
                .bind(&user.account_id)
                .execute(&state.pool)
                .await?;
        } else {
            let username = normalize_username(raw).ok_or_else(|| {
                AppError::bad_request(
                    "invalid_username",
                    "Το username θέλει 3–20 χαρακτήρες: πεζά, αριθμοί, κάτω παύλα.",
                )
            })?;
            // Uniqueness check (partial unique index το εγγυάται· εδώ για καθαρό 409).
            let taken: Option<String> =
                sqlx::query_scalar("SELECT id FROM accounts WHERE username = ? AND id != ?")
                    .bind(&username)
                    .bind(&user.account_id)
                    .fetch_optional(&state.pool)
                    .await?;
            if taken.is_some() {
                return Err(AppError::conflict(
                    "username_taken",
                    "Αυτό το username χρησιμοποιείται ήδη.",
                ));
            }
            sqlx::query("UPDATE accounts SET username = ? WHERE id = ?")
                .bind(&username)
                .bind(&user.account_id)
                .execute(&state.pool)
                .await?;
        }
    }

    if let Some(ref dn) = body.display_name {
        let trimmed = dn.trim();
        let value: Option<String> = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.chars().take(40).collect())
        };
        sqlx::query("UPDATE accounts SET display_name = ? WHERE id = ?")
            .bind(&value)
            .bind(&user.account_id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(share) = body.share_profile {
        sqlx::query("UPDATE accounts SET share_profile = ? WHERE id = ?")
            .bind(share)
            .bind(&user.account_id)
            .execute(&state.pool)
            .await?;
    }

    me(State(state), user).await
}

// ── POST /api/social/stats — publish aggregate snapshot ────────────────────────

#[derive(Deserialize)]
pub struct PublishStatsRequest {
    xp: i64,
    streak_days: i64,
    longest_streak_days: i64,
    #[serde(default)]
    badges: Vec<String>,
    /// XP από δραστηριότητα τελευταίων 7 ημερών (client-computed, clamped).
    /// None = παλιός client· δεν μπαίνει στο weekly board μέχρι να στείλει τιμή.
    #[serde(default)]
    week_xp: Option<i64>,
}

pub async fn publish_stats(
    State(state): State<AppState>,
    user: AuthUser,
    AppJson(body): AppJson<PublishStatsRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Clamp + server-authoritative derivation (αγνοούμε τυχόν client level/tier).
    let xp = body.xp.clamp(0, XP_MAX);
    let level = level_from_xp(xp);
    let (tier, altitude_m) = tier_for_level(level);
    let streak_days = body.streak_days.clamp(0, 100_000);
    let longest_streak_days = body.longest_streak_days.clamp(streak_days, 100_000);
    let ts = now_iso();
    // Το weekly είναι υποσύνολο του συνολικού XP — ένας client δεν μπορεί να
    // δηλώσει περισσότερο weekly από ό,τι total.
    let week_xp = body.week_xp.map(|w| w.clamp(0, xp));
    let week_xp_at = week_xp.as_ref().map(|_| ts.clone());
    // Φίλτραρε badges σε γνωστά ids, μοναδικά, ταξινομημένα (ντετερμινιστικό JSON).
    let mut badges: Vec<&str> = KNOWN_BADGES
        .iter()
        .copied()
        .filter(|id| body.badges.iter().any(|b| b == id))
        .collect();
    badges.sort_unstable();
    badges.dedup();
    let badges_json = serde_json::to_string(&badges).unwrap_or_else(|_| "[]".to_string());

    sqlx::query(
        "INSERT INTO profile_stats
             (account_id, level, xp, tier, altitude_m, badges, streak_days, longest_streak_days, updated_at, week_xp_at, week_xp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?11, ?10)
         ON CONFLICT(account_id) DO UPDATE SET
             level = ?2, xp = ?3, tier = ?4, altitude_m = ?5, badges = ?6,
             streak_days = ?7, longest_streak_days = ?8, updated_at = ?9,
             week_xp = ?10, week_xp_at = ?11",
    )
    .bind(&user.account_id)
    .bind(level)
    .bind(xp)
    .bind(tier)
    .bind(altitude_m)
    .bind(&badges_json)
    .bind(streak_days)
    .bind(longest_streak_days)
    .bind(&ts)
    .bind(week_xp.unwrap_or(0))
    .bind(&week_xp_at)
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({
        "level": level, "xp": xp, "tier": tier, "altitude_m": altitude_m,
        "week_xp": week_xp.unwrap_or(0)
    })))
}

// ── Friend rows (shared shape για friends list + requests) ─────────────────────

#[derive(Serialize, sqlx::FromRow)]
pub struct FriendRow {
    account_id: String,
    username: Option<String>,
    display_name: Option<String>,
    status: String,
    /// "in" = εισερχόμενο αίτημα προς εμένα· "out" = δικό μου προς άλλον·
    /// "friend" = αποδεκτή φιλία.
    direction: String,
    level: i64,
    xp: i64,
    tier: String,
    altitude_m: i64,
    streak_days: i64,
    /// JSON array από earned badge ids (κοινωνική απόδειξη στο row).
    badges: String,
}

/// Accepted φίλοι + τα (aggregate) stats τους. UNION και στις δύο κατευθύνσεις.
pub async fn friends(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<impl IntoResponse, AppError> {
    let rows = sqlx::query_as::<_, FriendRow>(
        "SELECT a.id AS account_id, a.username AS username, a.display_name AS display_name,
                'accepted' AS status, 'friend' AS direction,
                COALESCE(ps.level, 1) AS level, COALESCE(ps.xp, 0) AS xp,
                COALESCE(ps.tier, 'baseCamp') AS tier, COALESCE(ps.altitude_m, 0) AS altitude_m,
                COALESCE(ps.streak_days, 0) AS streak_days, COALESCE(ps.badges, '[]') AS badges
         FROM friendships f
         JOIN accounts a ON a.id = CASE WHEN f.requester_id = ?1 THEN f.addressee_id ELSE f.requester_id END
         LEFT JOIN profile_stats ps ON ps.account_id = a.id
         WHERE f.status = 'accepted' AND (f.requester_id = ?1 OR f.addressee_id = ?1)
         ORDER BY xp DESC, a.username",
    )
    .bind(&user.account_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

/// Εκκρεμή αιτήματα — εισερχόμενα (προς αποδοχή) + εξερχόμενα (σε αναμονή).
pub async fn requests(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<impl IntoResponse, AppError> {
    let rows = sqlx::query_as::<_, FriendRow>(
        "SELECT a.id AS account_id, a.username AS username, a.display_name AS display_name,
                'pending' AS status,
                CASE WHEN f.addressee_id = ?1 THEN 'in' ELSE 'out' END AS direction,
                COALESCE(ps.level, 1) AS level, COALESCE(ps.xp, 0) AS xp,
                COALESCE(ps.tier, 'baseCamp') AS tier, COALESCE(ps.altitude_m, 0) AS altitude_m,
                COALESCE(ps.streak_days, 0) AS streak_days, COALESCE(ps.badges, '[]') AS badges
         FROM friendships f
         JOIN accounts a ON a.id = CASE WHEN f.requester_id = ?1 THEN f.addressee_id ELSE f.requester_id END
         LEFT JOIN profile_stats ps ON ps.account_id = a.id
         WHERE f.status = 'pending' AND (f.requester_id = ?1 OR f.addressee_id = ?1)
         ORDER BY f.created_at DESC",
    )
    .bind(&user.account_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

// ── POST /api/social/requests — στείλε αίτημα με username ──────────────────────

#[derive(Deserialize)]
pub struct FriendRequestBody {
    username: String,
}

pub async fn send_request(
    State(state): State<AppState>,
    user: AuthUser,
    AppJson(body): AppJson<FriendRequestBody>,
) -> Result<impl IntoResponse, AppError> {
    let username = normalize_username(&body.username).ok_or_else(|| {
        // Uniform not-found (ίδιο με «δεν υπάρχει») → κανένα enumeration μέσω σφάλματος.
        AppError::not_found()
    })?;

    let target: Option<(String, bool)> =
        sqlx::query_as("SELECT id, disabled FROM accounts WHERE username = ?")
            .bind(&username)
            .fetch_optional(&state.pool)
            .await?;
    let Some((target_id, disabled)) = target else {
        return Err(AppError::not_found());
    };
    if disabled || target_id == user.account_id {
        // Self-add ή disabled → uniform not-found (μην αποκαλύπτεις κατάσταση).
        return Err(AppError::not_found());
    }

    // Υπάρχει ήδη ακμή (οποιαδήποτε κατεύθυνση);
    let existing: Option<(String, String, String)> = sqlx::query_as(
        "SELECT requester_id, addressee_id, status FROM friendships
         WHERE (requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1)",
    )
    .bind(&user.account_id)
    .bind(&target_id)
    .fetch_optional(&state.pool)
    .await?;

    let ts = now_iso();
    if let Some((requester_id, _addressee_id, status)) = existing {
        if status == "accepted" {
            return Err(AppError::conflict("already_friends", "Είστε ήδη φίλοι."));
        }
        // pending: αν ο ΑΛΛΟΣ μου είχε ήδη στείλει, το «request» = αποδοχή.
        if requester_id == target_id {
            sqlx::query(
                "UPDATE friendships SET status = 'accepted', updated_at = ?3
                 WHERE requester_id = ?1 AND addressee_id = ?2",
            )
            .bind(&target_id)
            .bind(&user.account_id)
            .bind(&ts)
            .execute(&state.pool)
            .await?;
            return Ok(Json(serde_json::json!({ "status": "accepted" })));
        }
        // Δικό μου pending ήδη → idempotent.
        return Ok(Json(serde_json::json!({ "status": "pending" })));
    }

    sqlx::query(
        "INSERT INTO friendships (requester_id, addressee_id, status, created_at, updated_at)
         VALUES (?1, ?2, 'pending', ?3, ?3)",
    )
    .bind(&user.account_id)
    .bind(&target_id)
    .bind(&ts)
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "status": "pending" })))
}

// ── POST /api/social/requests/{other_id}/accept ────────────────────────────────

pub async fn accept_request(
    State(state): State<AppState>,
    user: AuthUser,
    Path(other_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    // Αποδοχή μόνο εισερχόμενου pending (εγώ = addressee).
    let result = sqlx::query(
        "UPDATE friendships SET status = 'accepted', updated_at = ?3
         WHERE requester_id = ?2 AND addressee_id = ?1 AND status = 'pending'",
    )
    .bind(&user.account_id)
    .bind(&other_id)
    .bind(now_iso())
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::not_found());
    }
    Ok(Json(serde_json::json!({ "status": "accepted" })))
}

// ── POST /api/social/friends/{other_id}/remove ─────────────────────────────────
// Ένα endpoint για decline / cancel / unfriend: σβήνει ΟΠΟΙΑΔΗΠΟΤΕ ακμή μεταξύ μας.

pub async fn remove_friend(
    State(state): State<AppState>,
    user: AuthUser,
    Path(other_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    sqlx::query(
        "DELETE FROM friendships
         WHERE (requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1)",
    )
    .bind(&user.account_id)
    .bind(&other_id)
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({})))
}

// ── GET /api/social/leaderboard?scope=friends|global ───────────────────────────

#[derive(Deserialize)]
pub struct LeaderboardQuery {
    #[serde(default)]
    scope: String,
    /// "all" (default) ή "week" — τελευταίες 7 ημέρες.
    #[serde(default)]
    period: String,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct LeaderboardRow {
    username: Option<String>,
    display_name: Option<String>,
    level: i64,
    xp: i64,
    tier: String,
    altitude_m: i64,
    streak_days: i64,
    badges: String,
    week_xp: i64,
    is_self: bool,
}

pub async fn leaderboard(
    State(state): State<AppState>,
    user: AuthUser,
    axum::extract::Query(q): axum::extract::Query<LeaderboardQuery>,
) -> Result<impl IntoResponse, AppError> {
    // ΠΑΝΤΑ μέσα ο ίδιος (βλέπει τη θέση του) + οι επιλέξιμοι άλλοι. Η privacy
    // επιβάλλεται στο SQL: global → μόνο share_profile=1· friends → accepted edge.
    let week = q.period == "week";
    let cutoff = crate::util::iso_days_ago(7);
    let order = if week {
        "ORDER BY ps.week_xp DESC, ps.xp DESC, a.username"
    } else {
        "ORDER BY ps.xp DESC, a.username"
    };
    let period_filter = if week {
        "AND (ps.week_xp_at >= ?2 OR a.id = ?1)"
    } else {
        ""
    };

    let sql = if q.scope == "global" {
        format!(
            "SELECT a.username AS username, a.display_name AS display_name,
                    ps.level AS level, ps.xp AS xp, ps.tier AS tier,
                    ps.altitude_m AS altitude_m, ps.streak_days AS streak_days,
                    ps.badges AS badges, COALESCE(ps.week_xp, 0) AS week_xp,
                    (a.id = ?1) AS is_self
             FROM profile_stats ps JOIN accounts a ON a.id = ps.account_id
             WHERE a.disabled = 0 AND (a.share_profile = 1 OR a.id = ?1)
             {period_filter}
             {order}
             LIMIT 100"
        )
    } else {
        format!(
            "SELECT a.username AS username, a.display_name AS display_name,
                    ps.level AS level, ps.xp AS xp, ps.tier AS tier,
                    ps.altitude_m AS altitude_m, ps.streak_days AS streak_days,
                    ps.badges AS badges, COALESCE(ps.week_xp, 0) AS week_xp,
                    (a.id = ?1) AS is_self
             FROM profile_stats ps JOIN accounts a ON a.id = ps.account_id
             WHERE a.disabled = 0 AND (
                 a.id = ?1 OR a.id IN (
                     SELECT CASE WHEN requester_id = ?1 THEN addressee_id ELSE requester_id END
                     FROM friendships
                     WHERE status = 'accepted' AND (requester_id = ?1 OR addressee_id = ?1)
                 )
             )
             {period_filter}
             {order}
             LIMIT 100"
        )
    };

    let mut query = sqlx::query_as::<_, LeaderboardRow>(AssertSqlSafe(sql)).bind(&user.account_id);
    if week {
        query = query.bind(&cutoff);
    }
    let rows = query.fetch_all(&state.pool).await?;

    Ok(Json(rows))
}

// ── GET /api/social/search?q= — δημόσια ανακάλυψη ορειβατών ───────────────────
//
// Μόνο ό,τι είναι ήδη δημόσιο (share_profile=1), ποτέ email/raw data. Το query
// είναι substring του username ή του display_name· το exact username έρχεται
// πρώτο ώστε το «add by handle» να μη θάβεται κάτω από display-name matches.
// Λιγότερο από 2 chars → κενό (όχι σφάλμα), για να μη γίνεται enumeration με
// ένα γράμμα και για να μην ταλαιπωρείται το UI όσο πληκτρολογεί.

#[derive(Deserialize)]
pub struct SearchQuery {
    #[serde(default)]
    q: String,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct SearchResult {
    username: String,
    display_name: Option<String>,
    level: i64,
    xp: i64,
    tier: String,
    altitude_m: i64,
    streak_days: i64,
    badges: String,
    /// "friend" | "in" | "out" | null — ώστε το search να μη δείχνει «Add» σε
    /// κάποιον που είναι ήδη φίλος ή έχει εκκρεμές αίτημα.
    friendship: Option<String>,
}

pub async fn search(
    State(state): State<AppState>,
    user: AuthUser,
    axum::extract::Query(q): axum::extract::Query<SearchQuery>,
) -> Result<impl IntoResponse, AppError> {
    let query = q.q.trim().to_lowercase();
    if query.chars().count() < 2 {
        return Ok(Json(Vec::<SearchResult>::new()));
    }
    // Όριο για να μη γίνεται wildcard-scan σε τεράστιο string.
    let query: String = query.chars().take(40).collect();

    let rows = sqlx::query_as::<_, SearchResult>(
        "SELECT a.username AS username, a.display_name AS display_name,
                COALESCE(ps.level, 1) AS level, COALESCE(ps.xp, 0) AS xp,
                COALESCE(ps.tier, 'baseCamp') AS tier, COALESCE(ps.altitude_m, 0) AS altitude_m,
                COALESCE(ps.streak_days, 0) AS streak_days, COALESCE(ps.badges, '[]') AS badges,
                CASE
                    WHEN EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'accepted'
                        AND ((f.requester_id = ?1 AND f.addressee_id = a.id)
                          OR (f.addressee_id = ?1 AND f.requester_id = a.id))) THEN 'friend'
                    WHEN EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'pending'
                        AND f.requester_id = a.id AND f.addressee_id = ?1) THEN 'in'
                    WHEN EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'pending'
                        AND f.requester_id = ?1 AND f.addressee_id = a.id) THEN 'out'
                    ELSE NULL
                END AS friendship
         FROM accounts a LEFT JOIN profile_stats ps ON ps.account_id = a.id
         WHERE a.username IS NOT NULL AND a.disabled = 0 AND a.share_profile = 1
           AND a.id != ?1
           AND (instr(a.username, ?2) > 0 OR instr(lower(COALESCE(a.display_name, '')), ?2) > 0)
         ORDER BY CASE WHEN a.username = ?3 THEN 0 ELSE 1 END,
                  COALESCE(ps.xp, 0) DESC, a.username
         LIMIT 8",
    )
    .bind(&user.account_id)
    .bind(&query)
    .bind(&query)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

// ── GET /api/social/user/{username} — δημόσια προβολή προφίλ ───────────────────

#[derive(Serialize, sqlx::FromRow)]
pub struct PublicProfile {
    username: Option<String>,
    display_name: Option<String>,
    level: i64,
    xp: i64,
    tier: String,
    altitude_m: i64,
    badges: String,
    streak_days: i64,
    longest_streak_days: i64,
    /// Μόνο για logged-in προβολή: το id για accept/remove και η σχέση μας.
    /// Το anonymous endpoint τα γυρνά null — καμία εσωτερική ταυτότητα έξω.
    account_id: Option<String>,
    friendship: Option<String>,
}

/// Logged-out προβολή δημόσιου προφίλ — το τέλος του invite link.
///
/// Χωρίς `AuthUser` (άρα χωρίς friends exception): μόνο `share_profile=1` είναι
/// ορατό. Το route έχει το ίδιο social rate-limit· το uniform 404 κρύβει αν το
/// username δεν υπάρχει ή είναι ιδιωτικό.
pub async fn public_profile_anonymous(
    State(state): State<AppState>,
    Path(username): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let username = normalize_username(&username).ok_or_else(AppError::not_found)?;

    let row = sqlx::query_as::<_, PublicProfile>(
        "SELECT a.username AS username, a.display_name AS display_name,
                COALESCE(ps.level, 1) AS level, COALESCE(ps.xp, 0) AS xp,
                COALESCE(ps.tier, 'baseCamp') AS tier, COALESCE(ps.altitude_m, 0) AS altitude_m,
                COALESCE(ps.badges, '[]') AS badges,
                COALESCE(ps.streak_days, 0) AS streak_days,
                COALESCE(ps.longest_streak_days, 0) AS longest_streak_days,
                NULL AS account_id, NULL AS friendship
         FROM accounts a LEFT JOIN profile_stats ps ON ps.account_id = a.id
         WHERE a.username = ?1 AND a.disabled = 0 AND a.share_profile = 1",
    )
    .bind(&username)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(AppError::not_found)?;

    Ok(Json(row))
}

pub async fn public_profile(
    State(state): State<AppState>,
    user: AuthUser,
    Path(username): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let username = normalize_username(&username).ok_or_else(AppError::not_found)?;

    // Privacy στο SQL: ορατό μόνο αν share_profile=1 Ή είναι accepted φίλος μου.
    // Uniform not-found αλλιώς (καμία διαφορά «δεν υπάρχει» vs «ιδιωτικό»).
    let row = sqlx::query_as::<_, PublicProfile>(
        "SELECT a.username AS username, a.display_name AS display_name,
                COALESCE(ps.level, 1) AS level, COALESCE(ps.xp, 0) AS xp,
                COALESCE(ps.tier, 'baseCamp') AS tier, COALESCE(ps.altitude_m, 0) AS altitude_m,
                COALESCE(ps.badges, '[]') AS badges,
                COALESCE(ps.streak_days, 0) AS streak_days,
                COALESCE(ps.longest_streak_days, 0) AS longest_streak_days,
                a.id AS account_id,
                CASE
                    WHEN a.id = ?1 THEN 'self'
                    WHEN EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'accepted'
                        AND ((f.requester_id = ?1 AND f.addressee_id = a.id)
                          OR (f.addressee_id = ?1 AND f.requester_id = a.id))) THEN 'friend'
                    WHEN EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'pending'
                        AND f.requester_id = a.id AND f.addressee_id = ?1) THEN 'in'
                    WHEN EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'pending'
                        AND f.requester_id = ?1 AND f.addressee_id = a.id) THEN 'out'
                    ELSE NULL
                END AS friendship
         FROM accounts a LEFT JOIN profile_stats ps ON ps.account_id = a.id
         WHERE a.username = ?2 AND a.disabled = 0 AND (
             a.share_profile = 1 OR a.id = ?1 OR a.id IN (
                 SELECT CASE WHEN requester_id = ?1 THEN addressee_id ELSE requester_id END
                 FROM friendships
                 WHERE status = 'accepted' AND (requester_id = ?1 OR addressee_id = ?1)
             )
         )",
    )
    .bind(&user.account_id)
    .bind(&username)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(AppError::not_found)?;

    Ok(Json(row))
}
