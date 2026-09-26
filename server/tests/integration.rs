use anabasis_api::app::{build_state, router, AppState, EmailConfig, GoogleOAuthConfig};
use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use serde_json::{json, Value};
use tower::ServiceExt;

async fn test_app(admin_email: Option<&str>) -> (Router, AppState, tempfile::TempDir) {
    test_app_full(admin_email, Some("test-admin-code")).await
}

async fn test_app_full(
    admin_email: Option<&str>,
    admin_code: Option<&str>,
) -> (Router, AppState, tempfile::TempDir) {
    test_app_with_oauth(admin_email, admin_code, None).await
}

/// Ίδιο harness με test_app_full, με προαιρετικό Google OAuth config — μόνο
/// για τα oauth tests, ώστε τα υπόλοιπα 17 tests να μένουν ανέγγιχτα.
async fn test_app_with_oauth(
    admin_email: Option<&str>,
    admin_code: Option<&str>,
    google_oauth: Option<GoogleOAuthConfig>,
) -> (Router, AppState, tempfile::TempDir) {
    let dir = tempfile::tempdir().expect("tempdir");
    let db_path = dir.path().join("anabasis-test.db");
    let state = build_state(
        db_path,
        admin_email.map(str::to_string),
        admin_code.map(str::to_string),
        google_oauth,
        None,
    )
    .await
    .expect("build_state");
    let app = router(state.clone());
    (app, state, dir)
}

async fn call(
    app: &Router,
    method: &str,
    uri: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header("cf-connecting-ip", "203.0.113.7")
        .header("content-type", "application/json");
    if let Some(t) = token {
        builder = builder.header("authorization", format!("Bearer {t}"));
    }
    let body_bytes = body
        .map(|v| serde_json::to_vec(&v).unwrap())
        .unwrap_or_default();
    let req = builder.body(Body::from(body_bytes)).unwrap();

    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = axum::body::to_bytes(res.into_body(), usize::MAX)
        .await
        .unwrap();
    let value: Value = if bytes.is_empty() {
        json!(null)
    } else {
        serde_json::from_slice(&bytes).unwrap()
    };
    (status, value)
}

async fn signup(app: &Router, email: &str, password: &str) -> (StatusCode, Value) {
    call(
        app,
        "POST",
        "/api/auth/signup",
        None,
        Some(json!({ "email": email, "password": password })),
    )
    .await
}

async fn login(app: &Router, email: &str, password: &str) -> (StatusCode, Value) {
    call(
        app,
        "POST",
        "/api/auth/login",
        None,
        Some(json!({ "email": email, "password": password })),
    )
    .await
}

#[tokio::test]
async fn signup_login_me_happy_path() {
    let (app, _state, _dir) = test_app(None).await;

    let (status, body) = signup(&app, "Athlete@Example.com", "correcthorsebattery").await;
    assert_eq!(status, StatusCode::OK);
    let token = body["token"].as_str().unwrap().to_string();
    assert_eq!(body["account"]["email"], "athlete@example.com");
    assert_eq!(body["account"]["role"], "user");

    let (status, body) = login(&app, "athlete@example.com", "correcthorsebattery").await;
    assert_eq!(status, StatusCode::OK);
    let login_token = body["token"].as_str().unwrap().to_string();
    assert_ne!(login_token, token, "κάθε login παίρνει νέο session token");

    let (status, body) = call(&app, "GET", "/api/me", Some(&login_token), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["email"], "athlete@example.com");
    assert_eq!(body["role"], "user");
    assert!(body["last_sync_at"].is_null());
}

#[tokio::test]
async fn wrong_password_and_unknown_email_return_identical_body() {
    let (app, _state, _dir) = test_app(None).await;
    signup(&app, "real@example.com", "correcthorsebattery").await;

    let (status_wrong, body_wrong) =
        login(&app, "real@example.com", "totally-wrong-password").await;
    let (status_unknown, body_unknown) =
        login(&app, "ghost@example.com", "whatever-password").await;

    assert_eq!(status_wrong, StatusCode::UNAUTHORIZED);
    assert_eq!(status_unknown, StatusCode::UNAUTHORIZED);
    assert_eq!(
        body_wrong, body_unknown,
        "no user enumeration: ίδιο body σε λάθος pass vs άγνωστο email"
    );
    assert_eq!(body_wrong["error"], "bad_credentials");
}

#[tokio::test]
async fn five_failures_trigger_lockout() {
    let (app, _state, _dir) = test_app(None).await;
    signup(&app, "lockme@example.com", "correcthorsebattery").await;

    for attempt in 1..=5 {
        let (status, _) = login(&app, "lockme@example.com", "wrong-password").await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "attempt {attempt} πριν το lockout"
        );
    }

    // Ακόμα και με ΣΩΣΤΟ password, το lockout μπλοκάρει πριν καν γίνει verify.
    let (status, body) = login(&app, "lockme@example.com", "correcthorsebattery").await;
    assert_eq!(status, StatusCode::LOCKED);
    assert_eq!(body["error"], "locked");
}

#[tokio::test]
async fn admin_role_via_env_and_non_admin_forbidden() {
    let (app, _state, _dir) = test_app(Some("admin@example.com")).await;

    let (status, body) = signup(&app, "admin@example.com", "correcthorsebattery").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["account"]["role"], "admin");
    let admin_token = body["token"].as_str().unwrap().to_string();

    let (status, body) = signup(&app, "regular@example.com", "correcthorsebattery").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["account"]["role"], "user");
    let user_token = body["token"].as_str().unwrap().to_string();

    let (status, _) = call(&app, "GET", "/api/admin/users", Some(&user_token), None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, body) = call(&app, "GET", "/api/admin/users", Some(&admin_token), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body.as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn disable_user_kills_session() {
    let (app, _state, _dir) = test_app(Some("admin@example.com")).await;

    let (_, admin_body) = signup(&app, "admin@example.com", "correcthorsebattery").await;
    let admin_token = admin_body["token"].as_str().unwrap().to_string();

    let (_, user_body) = signup(&app, "target@example.com", "correcthorsebattery").await;
    let user_token = user_body["token"].as_str().unwrap().to_string();
    let user_id = user_body["account"]["id"].as_str().unwrap().to_string();

    let (status, me_before) = call(&app, "GET", "/api/me", Some(&user_token), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me_before["email"], "target@example.com");

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/admin/users/{user_id}/disable"),
        Some(&admin_token),
        Some(json!({ "disabled": true })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = call(&app, "GET", "/api/me", Some(&user_token), None).await;
    assert!(
        status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN,
        "μετά το disable το παλιό token πρέπει να είναι άκυρο, πήρα {status}"
    );
}

/// Item #4 του backlog: auth/admin hardening. Ένας admin δεν πρέπει να
/// μπορεί να απενεργοποιήσει τον ΔΙΚΟ ΤΟΥ λογαριασμό — αυτό θα τον
/// αποσύνδεε άμεσα (disable σκοτώνει sessions), χωρίς κανέναν να το
/// αναστρέψει αν έτυχε να είναι ο μοναδικός admin.
#[tokio::test]
async fn disable_user_rejects_self_disable() {
    let (app, _state, _dir) = test_app(Some("admin@example.com")).await;

    let (_, admin_body) = signup(&app, "admin@example.com", "correcthorsebattery").await;
    let admin_token = admin_body["token"].as_str().unwrap().to_string();
    let admin_id = admin_body["account"]["id"].as_str().unwrap().to_string();

    let (status, body) = call(
        &app,
        "POST",
        &format!("/api/admin/users/{admin_id}/disable"),
        Some(&admin_token),
        Some(json!({ "disabled": true })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "self_disable");

    // Το δικό του token μένει έγκυρο — τίποτα δεν άλλαξε.
    let (status, _) = call(&app, "GET", "/api/me", Some(&admin_token), None).await;
    assert_eq!(status, StatusCode::OK);
}

/// Με 2 admins επιτρέπεται ο ένας να απενεργοποιήσει τον άλλον (ο ενεργών
/// admin μένει πάντα ενεργός μετά — δεν αδειάζει ποτέ). Μόλις μείνει ΜΟΝΟΣ,
/// ο ίδιος self-disable guard τον εμποδίζει να απενεργοποιήσει τον εαυτό
/// του — στην πράξη ο self-disable guard ήδη καλύπτει το "last admin"
/// invariant (κανένα endpoint δεν αφαιρεί admin χωρίς disable_user, κι ο
/// ενεργών είναι πάντα ο ίδιος ο admin), το last_admin check στο admin.rs
/// μένει ως defense-in-depth για μελλοντικά admin-management endpoints.
#[tokio::test]
async fn disable_user_rejects_disabling_last_active_admin() {
    let (app, _state, _dir) = test_app(Some("admin@example.com")).await;

    let (_, admin_body) = signup(&app, "admin@example.com", "correcthorsebattery").await;
    let admin_id = admin_body["account"]["id"].as_str().unwrap().to_string();

    let (_, second_body) = signup(&app, "second@example.com", "correcthorsebattery").await;
    let second_token = second_body["token"].as_str().unwrap().to_string();
    let second_id = second_body["account"]["id"].as_str().unwrap().to_string();

    // Ο second γίνεται ΚΙ αυτός admin (claim_admin) ώστε να υπάρχουν δύο.
    let (status, _) = call(
        &app,
        "POST",
        "/api/auth/claim_admin",
        Some(&second_token),
        Some(json!({ "code": "test-admin-code" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // Ο second (τώρα admin) απενεργοποιεί τον πρώτο — δύο admins, επιτρέπεται.
    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/admin/users/{admin_id}/disable"),
        Some(&second_token),
        Some(json!({ "disabled": true })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "με 2 admins επιτρέπεται");

    // Τώρα ο second είναι ο ΜΟΝΑΔΙΚΟΣ ενεργός admin — δεν επιτρέπεται να
    // απενεργοποιήσει τον εαυτό του (self_disable) ΟΥΤΕ, θεωρητικά, κάποιον
    // άλλον admin (δεν υπάρχει άλλος admin πια να δοκιμάσουμε, αλλά ο
    // self_disable guard ήδη το καλύπτει).
    let (status, body) = call(
        &app,
        "POST",
        &format!("/api/admin/users/{second_id}/disable"),
        Some(&second_token),
        Some(json!({ "disabled": true })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "self_disable");
}

async fn signed_in_user(app: &Router) -> (String, String) {
    let (_, body) = signup(app, "syncuser@example.com", "correcthorsebattery").await;
    let token = body["token"].as_str().unwrap().to_string();
    let user_id = body["account"]["id"].as_str().unwrap().to_string();
    (token, user_id)
}

#[tokio::test]
async fn push_pull_round_trip_returns_higher_cursor() {
    let (app, _state, _dir) = test_app(None).await;
    let (token, user_id) = signed_in_user(&app).await;

    let row =
        json!({ "id": "goal-1", "user_id": user_id, "title": "Handstand", "deleted_at": null });
    let (status, body) = call(
        &app,
        "POST",
        "/api/sync/push",
        Some(&token),
        Some(json!({ "changes": [ { "tbl": "goals", "rows": [ row ] } ] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let cursor = body["cursor"].as_i64().unwrap();
    assert!(cursor > 0);

    let (status, body) = call(
        &app,
        "POST",
        "/api/sync/pull",
        Some(&token),
        Some(json!({ "cursor": 0 })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["cursor"].as_i64().unwrap(), cursor);
    assert_eq!(body["has_more"], false);

    let changes = body["changes"].as_array().unwrap();
    let goals_change = changes
        .iter()
        .find(|c| c["tbl"] == "goals")
        .expect("goals change present");
    let rows = goals_change["rows"].as_array().unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["id"], "goal-1");
}

#[tokio::test]
async fn pull_with_cursor_skips_already_seen_rows() {
    let (app, _state, _dir) = test_app(None).await;
    let (token, user_id) = signed_in_user(&app).await;

    let row_a = json!({ "id": "row-a", "user_id": user_id, "v": 1 });
    let (_, body_a) = call(
        &app,
        "POST",
        "/api/sync/push",
        Some(&token),
        Some(json!({ "changes": [ { "tbl": "goals", "rows": [ row_a ] } ] })),
    )
    .await;
    let cursor_a = body_a["cursor"].as_i64().unwrap();

    let row_b = json!({ "id": "row-b", "user_id": user_id, "v": 2 });
    let (_, body_b) = call(
        &app,
        "POST",
        "/api/sync/push",
        Some(&token),
        Some(json!({ "changes": [ { "tbl": "goals", "rows": [ row_b ] } ] })),
    )
    .await;
    let cursor_b = body_b["cursor"].as_i64().unwrap();
    assert!(cursor_b > cursor_a);

    let (status, body) = call(
        &app,
        "POST",
        "/api/sync/pull",
        Some(&token),
        Some(json!({ "cursor": cursor_a })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let changes = body["changes"].as_array().unwrap();
    let goals_change = changes
        .iter()
        .find(|c| c["tbl"] == "goals")
        .expect("goals change present");
    let rows = goals_change["rows"].as_array().unwrap();
    assert_eq!(rows.len(), 1, "μόνο το row μετά το cursor");
    assert_eq!(rows[0]["id"], "row-b");
}

/// Item #3 του backlog: server real LWW. Πριν, το push ήταν last-ARRIVAL-
/// wins (blind overwrite) — ένα stale push (π.χ. offline συσκευή που
/// ξαναβγαίνει online αργότερα) θα μπορούσε να διαγράψει σιωπηλά μια
/// νεότερη αλλαγή από άλλη συσκευή. Τώρα συγκρίνεται το `updated_at`.
#[tokio::test]
async fn push_stale_updated_at_does_not_clobber_newer_row() {
    let (app, state, _dir) = test_app(None).await;
    let (token, user_id) = signed_in_user(&app).await;

    // Device B: πιο πρόσφατη αλλαγή, φτάνει ΠΡΩΤΗ.
    let newer = json!({
        "id": "goal-lww", "user_id": user_id, "title": "from device B",
        "updated_at": "2026-08-30T10:05:00.000Z", "deleted_at": null,
    });
    let (status, _) = call(
        &app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [ { "tbl": "goals", "rows": [ newer ] } ] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // Device A: παλιότερη αλλαγή (offline τη στιγμή του edit), φτάνει ΔΕΥΤΕΡΗ.
    let stale = json!({
        "id": "goal-lww", "user_id": user_id, "title": "from device A (stale)",
        "updated_at": "2026-08-30T10:00:00.000Z", "deleted_at": null,
    });
    let (status, _) = call(
        &app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [ { "tbl": "goals", "rows": [ stale ] } ] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "stale push γίνεται δεκτό — απλώς δεν κλέβει");

    let stored_payload: String = sqlx::query_scalar(
        "SELECT payload FROM sync_rows WHERE account_id = ? AND tbl = 'goals' AND row_id = 'goal-lww'",
    )
    .bind(&user_id)
    .fetch_one(&state.pool)
    .await
    .unwrap();
    let stored: Value = serde_json::from_str(&stored_payload).unwrap();
    assert_eq!(stored["title"], "from device B", "η νεότερη αλλαγή ΔΕΝ διαγράφεται από stale push");
}

/// Ισοπαλία στο updated_at → κρατάμε ό,τι υπάρχει ήδη (deterministic, ίδιο
/// σε κάθε retry· δεν υπάρχει έννοια «id tiebreak» εδώ αφού το row_id είναι
/// το ίδιο και στις δύο πλευρές).
#[tokio::test]
async fn push_identical_updated_at_keeps_existing() {
    let (app, state, _dir) = test_app(None).await;
    let (token, user_id) = signed_in_user(&app).await;

    let same_ts = "2026-08-30T10:00:00.000Z";
    let first = json!({ "id": "goal-tie", "user_id": user_id, "title": "first", "updated_at": same_ts });
    call(
        &app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [ { "tbl": "goals", "rows": [ first ] } ] })),
    )
    .await;

    let second = json!({ "id": "goal-tie", "user_id": user_id, "title": "second", "updated_at": same_ts });
    call(
        &app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [ { "tbl": "goals", "rows": [ second ] } ] })),
    )
    .await;

    let stored_payload: String = sqlx::query_scalar(
        "SELECT payload FROM sync_rows WHERE account_id = ? AND tbl = 'goals' AND row_id = 'goal-tie'",
    )
    .bind(&user_id)
    .fetch_one(&state.pool)
    .await
    .unwrap();
    let stored: Value = serde_json::from_str(&stored_payload).unwrap();
    assert_eq!(stored["title"], "first");
}

/// Ένα push που ΑΠΟΤΕΛΕΙΤΑΙ ΜΟΝΟ από LWW losers δεν πρέπει να επιστρέφει
/// cursor 0 — αλλιώς ο caller θα νόμιζε ότι ο λογαριασμός ξαναγύρισε πίσω.
#[tokio::test]
async fn push_cursor_reflects_current_seq_even_when_every_row_loses() {
    let (app, _state, _dir) = test_app(None).await;
    let (token, user_id) = signed_in_user(&app).await;

    let newer = json!({
        "id": "goal-cursor", "user_id": user_id, "title": "newer",
        "updated_at": "2026-08-30T10:05:00.000Z",
    });
    let (_, body) = call(
        &app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [ { "tbl": "goals", "rows": [ newer ] } ] })),
    )
    .await;
    let cursor_after_first_push = body["cursor"].as_i64().unwrap();
    assert!(cursor_after_first_push > 0);

    let stale = json!({
        "id": "goal-cursor", "user_id": user_id, "title": "stale",
        "updated_at": "2026-08-30T10:00:00.000Z",
    });
    let (status, body) = call(
        &app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [ { "tbl": "goals", "rows": [ stale ] } ] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["cursor"].as_i64().unwrap(),
        cursor_after_first_push,
        "cursor μένει στο τρέχον last_seq, όχι 0",
    );
}

#[tokio::test]
async fn push_with_wrong_user_id_rejected() {
    let (app, _state, _dir) = test_app(None).await;
    let (token, _user_id) = signed_in_user(&app).await;

    let row = json!({ "id": "row-x", "user_id": "someone-elses-account-id", "v": 1 });
    let (status, body) = call(
        &app,
        "POST",
        "/api/sync/push",
        Some(&token),
        Some(json!({ "changes": [ { "tbl": "goals", "rows": [ row ] } ] })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "wrong_user");
}

#[tokio::test]
async fn unknown_table_rejected() {
    let (app, _state, _dir) = test_app(None).await;
    let (token, user_id) = signed_in_user(&app).await;

    let row = json!({ "id": "row-y", "user_id": user_id, "v": 1 });
    let (status, body) = call(
        &app,
        "POST",
        "/api/sync/push",
        Some(&token),
        Some(json!({ "changes": [ { "tbl": "not_a_real_table", "rows": [ row ] } ] })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "unknown_table");
}

#[tokio::test]
async fn tombstone_round_trips_and_marks_deleted() {
    let (app, state, _dir) = test_app(None).await;
    let (token, user_id) = signed_in_user(&app).await;

    let row = json!({ "id": "row-gone", "user_id": user_id, "deleted_at": "2026-08-28T00:00:00Z" });
    let (status, _) = call(
        &app,
        "POST",
        "/api/sync/push",
        Some(&token),
        Some(json!({ "changes": [ { "tbl": "goals", "rows": [ row ] } ] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let stored_deleted: i64 =
        sqlx::query_scalar("SELECT deleted FROM sync_rows WHERE account_id = ? AND tbl = 'goals' AND row_id = 'row-gone'")
            .bind(&user_id)
            .fetch_one(&state.pool)
            .await
            .unwrap();
    assert_eq!(stored_deleted, 1);

    let (status, body) = call(
        &app,
        "POST",
        "/api/sync/pull",
        Some(&token),
        Some(json!({ "cursor": 0 })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let changes = body["changes"].as_array().unwrap();
    let goals_change = changes
        .iter()
        .find(|c| c["tbl"] == "goals")
        .expect("goals change present");
    let rows = goals_change["rows"].as_array().unwrap();
    let tombstone = rows
        .iter()
        .find(|r| r["id"] == "row-gone")
        .expect("tombstone present στο pull");
    assert!(!tombstone["deleted_at"].is_null());
}

#[tokio::test]
async fn health_check_needs_no_auth() {
    let (app, _state, _dir) = test_app(None).await;
    let (status, body) = call(&app, "GET", "/api/health", None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["ok"], true);
}

#[tokio::test]
async fn logout_kills_the_session() {
    let (app, _state, _dir) = test_app(None).await;
    let (token, _user_id) = signed_in_user(&app).await;

    let (status, _) = call(
        &app,
        "POST",
        "/api/auth/logout",
        Some(&token),
        Some(json!({})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = call(&app, "GET", "/api/me", Some(&token), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn change_password_invalidates_other_sessions_only() {
    let (app, _state, _dir) = test_app(None).await;
    let (_, signup_body) = signup(&app, "twofactor@example.com", "correcthorsebattery").await;
    let token_a = signup_body["token"].as_str().unwrap().to_string();

    let (_, login_body) = login(&app, "twofactor@example.com", "correcthorsebattery").await;
    let token_b = login_body["token"].as_str().unwrap().to_string();

    let (status, _) = call(
        &app,
        "POST",
        "/api/auth/change_password",
        Some(&token_b),
        Some(
            json!({ "current_password": "correcthorsebattery", "new_password": "newpassword123" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = call(&app, "GET", "/api/me", Some(&token_b), None).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "το session που έκανε το change_password μένει ζωντανό"
    );

    let (status, _) = call(&app, "GET", "/api/me", Some(&token_a), None).await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "τα ΑΛΛΑ sessions ακυρώνονται"
    );
}

/* ─────────── claim_admin (κωδικός προαγωγής σε admin) ─────────── */

#[tokio::test]
async fn claim_admin_with_correct_code_promotes() {
    let (app, _state, _dir) = test_app(None).await;
    let (_, signup) = call(
        &app,
        "POST",
        "/api/auth/signup",
        None,
        Some(json!({"email": "user@x.gr", "password": "password123"})),
    )
    .await;
    let token = signup["token"].as_str().unwrap().to_string();

    let (status, body) = call(
        &app,
        "POST",
        "/api/auth/claim_admin",
        Some(&token),
        Some(json!({"code": "test-admin-code"})),
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(body["role"], "admin");

    // Ο ρόλος ισχύει αμέσως: /me τον δείχνει και τα admin endpoints ανοίγουν.
    let (_, me) = call(&app, "GET", "/api/me", Some(&token), None).await;
    assert_eq!(me["role"], "admin");
    let (status, _) = call(&app, "GET", "/api/admin/stats", Some(&token), None).await;
    assert_eq!(status, 200);
}

#[tokio::test]
async fn claim_admin_wrong_code_is_403_and_role_unchanged() {
    let (app, _state, _dir) = test_app(None).await;
    let (_, signup) = call(
        &app,
        "POST",
        "/api/auth/signup",
        None,
        Some(json!({"email": "user2@x.gr", "password": "password123"})),
    )
    .await;
    let token = signup["token"].as_str().unwrap().to_string();

    let (status, body) = call(
        &app,
        "POST",
        "/api/auth/claim_admin",
        Some(&token),
        Some(json!({"code": "wrong"})),
    )
    .await;
    assert_eq!(status, 403);
    assert_eq!(body["error"], "bad_code");
    let (_, me) = call(&app, "GET", "/api/me", Some(&token), None).await;
    assert_eq!(me["role"], "user");
}

#[tokio::test]
async fn claim_admin_without_configured_code_is_403() {
    let (app, _state, _dir) = test_app_full(None, None).await;
    let (_, signup) = call(
        &app,
        "POST",
        "/api/auth/signup",
        None,
        Some(json!({"email": "user3@x.gr", "password": "password123"})),
    )
    .await;
    let token = signup["token"].as_str().unwrap().to_string();

    let (status, body) = call(
        &app,
        "POST",
        "/api/auth/claim_admin",
        Some(&token),
        Some(json!({"code": "anything"})),
    )
    .await;
    assert_eq!(status, 403);
    assert_eq!(body["error"], "admin_code_not_set");
}

/* ─────────── epoch (προστασία από restore-desync) ─────────── */

#[tokio::test]
async fn epoch_present_and_stable_across_restarts() {
    let dir = tempfile::tempdir().expect("tempdir");
    let db_path = dir.path().join("epoch-test.db");
    let s1 = build_state(db_path.clone(), None, None, None, None)
        .await
        .expect("s1");
    let s2 = build_state(db_path, None, None, None, None).await.expect("s2");
    // Ίδιο αρχείο βάσης = ίδιο epoch· νέο αρχείο θα έδινε νέο.
    assert_eq!(s1.epoch, s2.epoch);
    assert!(!s1.epoch.is_empty());

    let app = router(s1.clone());
    let (status, health) = call(&app, "GET", "/api/health", None, None).await;
    assert_eq!(status, 200);
    assert_eq!(health["epoch"], s1.epoch.as_str());
}

/* ─────────── Google OAuth (δορμάν χωρίς config) ─────────── */

fn test_google_config() -> GoogleOAuthConfig {
    GoogleOAuthConfig {
        client_id: "test-client-id".to_string(),
        client_secret: "test-client-secret".to_string(),
        public_url: "https://anabasis.axonos.dev".to_string(),
    }
}

#[tokio::test]
async fn google_oauth_providers_reports_disabled_by_default() {
    let (app, _state, _dir) = test_app(None).await;
    let (status, body) = call(&app, "GET", "/api/auth/oauth/providers", None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["google"], false);
}

#[tokio::test]
async fn google_oauth_providers_reports_enabled_when_configured() {
    let (app, _state, _dir) = test_app_with_oauth(None, None, Some(test_google_config())).await;
    let (status, body) = call(&app, "GET", "/api/auth/oauth/providers", None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["google"], true);
}

#[tokio::test]
async fn google_oauth_start_is_disabled_without_config() {
    let (app, _state, _dir) = test_app(None).await;
    let (status, body) = call(&app, "GET", "/api/auth/oauth/google/start", None, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], "oauth_disabled");
}

#[tokio::test]
async fn google_oauth_callback_is_disabled_without_config() {
    let (app, _state, _dir) = test_app(None).await;
    let (status, body) = call(
        &app,
        "GET",
        "/api/auth/oauth/google/callback?code=whatever&state=whatever",
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], "oauth_disabled");
}

#[tokio::test]
async fn google_oauth_start_redirects_to_google_when_configured() {
    let (app, _state, _dir) = test_app_with_oauth(None, None, Some(test_google_config())).await;

    let req = Request::builder()
        .method("GET")
        .uri("/api/auth/oauth/google/start")
        .header("cf-connecting-ip", "203.0.113.7")
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::FOUND);

    let location = res
        .headers()
        .get("location")
        .expect("Location header")
        .to_str()
        .unwrap()
        .to_string();
    assert!(location.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"));
    assert!(location.contains("client_id=test-client-id"));
    assert!(location.contains("state="));
    assert!(location.contains(
        "redirect_uri=https%3A%2F%2Fanabasis.axonos.dev%2Fapi%2Fauth%2Foauth%2Fgoogle%2Fcallback"
    ));
}

#[tokio::test]
async fn google_oauth_callback_state_mismatch_is_400() {
    let (app, _state, _dir) = test_app_with_oauth(None, None, Some(test_google_config())).await;

    let (status, body) = call(
        &app,
        "GET",
        "/api/auth/oauth/google/callback?code=whatever&state=does-not-exist",
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "invalid_state");
}

#[tokio::test]
async fn google_oauth_callback_missing_state_is_400() {
    let (app, _state, _dir) = test_app_with_oauth(None, None, Some(test_google_config())).await;

    let (status, body) = call(
        &app,
        "GET",
        "/api/auth/oauth/google/callback?code=whatever",
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "invalid_state");
}

#[tokio::test]
async fn google_oauth_start_issued_state_is_single_use() {
    let (app, state, _dir) = test_app_with_oauth(None, None, Some(test_google_config())).await;

    let req = Request::builder()
        .method("GET")
        .uri("/api/auth/oauth/google/start")
        .header("cf-connecting-ip", "203.0.113.7")
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let location = res
        .headers()
        .get("location")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    let state_token = location
        .split("state=")
        .nth(1)
        .unwrap()
        .split('&')
        .next()
        .unwrap()
        .to_string();

    // Ένα ΜΗ configured state DB row επιβεβαιώνει ότι το /start πράγματι
    // το αποθήκευσε (χωρίς να χρειάζεται να χτυπήσουμε το πραγματικό Google).
    let stored: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM oauth_states WHERE state = ?")
        .bind(&state_token)
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(stored, 1);

    // callback χωρίς `code` μετά από consume του σωστού state → missing_code,
    // ΟΧΙ invalid_state — αποδεικνύει ότι το state validation πέρασε.
    let (status, body) = call(
        &app,
        "GET",
        &format!("/api/auth/oauth/google/callback?state={state_token}"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "missing_code");

    // Δεύτερη χρήση του ΙΔΙΟΥ state → πλέον καταναλωμένο.
    let (status, body) = call(
        &app,
        "GET",
        &format!("/api/auth/oauth/google/callback?state={state_token}&code=whatever"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "invalid_state");
}

// ── Social: φιλίες, aggregate προφίλ, leaderboard, privacy ─────────────────────

async fn set_username(app: &Router, token: &str, username: &str) -> (StatusCode, Value) {
    call(
        app,
        "POST",
        "/api/social/profile",
        Some(token),
        Some(json!({ "username": username })),
    )
    .await
}

async fn publish_stats(app: &Router, token: &str, xp: i64) -> (StatusCode, Value) {
    call(
        app,
        "POST",
        "/api/social/stats",
        Some(token),
        Some(json!({ "xp": xp, "streak_days": 3, "longest_streak_days": 5, "badges": ["first-ascent", "bogus-badge"] })),
    )
    .await
}

#[tokio::test]
async fn social_username_set_validate_and_uniqueness() {
    let (app, _state, _dir) = test_app(None).await;
    let a = signup(&app, "a@example.com", "correcthorsebattery").await.1["token"]
        .as_str().unwrap().to_string();
    let b = signup(&app, "b@example.com", "correcthorsebattery").await.1["token"]
        .as_str().unwrap().to_string();

    // Έγκυρο username.
    let (status, body) = set_username(&app, &a, "Alpinist_1").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["username"], "alpinist_1"); // normalized lowercase

    // Πολύ κοντό → 400.
    let (status, body) = set_username(&app, &b, "ab").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "invalid_username");

    // Ίδιο handle → 409.
    let (status, body) = set_username(&app, &b, "alpinist_1").await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["error"], "username_taken");
}

#[tokio::test]
async fn social_friend_request_accept_and_list() {
    let (app, _state, _dir) = test_app(None).await;
    let a = signup(&app, "a@example.com", "correcthorsebattery").await.1["token"]
        .as_str().unwrap().to_string();
    let b = signup(&app, "b@example.com", "correcthorsebattery").await.1["token"]
        .as_str().unwrap().to_string();
    set_username(&app, &a, "aaa").await;
    set_username(&app, &b, "bbb").await;

    // A → B request.
    let (status, body) = call(&app, "POST", "/api/social/requests", Some(&a),
        Some(json!({ "username": "bbb" }))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "pending");

    // B sees incoming.
    let (status, body) = call(&app, "GET", "/api/social/requests", Some(&b), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body.as_array().unwrap().len(), 1);
    assert_eq!(body[0]["direction"], "in");
    assert_eq!(body[0]["username"], "aaa");
    let a_id = body[0]["account_id"].as_str().unwrap().to_string();

    // B accepts.
    let (status, _) = call(&app, "POST", &format!("/api/social/requests/{a_id}/accept"),
        Some(&b), None).await;
    assert_eq!(status, StatusCode::OK);

    // Both now list each other as friend.
    let (_, fa) = call(&app, "GET", "/api/social/friends", Some(&a), None).await;
    assert_eq!(fa.as_array().unwrap().len(), 1);
    assert_eq!(fa[0]["username"], "bbb");
    let (_, fb) = call(&app, "GET", "/api/social/friends", Some(&b), None).await;
    assert_eq!(fb[0]["username"], "aaa");
}

#[tokio::test]
async fn social_mutual_pending_auto_accepts() {
    let (app, _state, _dir) = test_app(None).await;
    let a = signup(&app, "a@example.com", "correcthorsebattery").await.1["token"]
        .as_str().unwrap().to_string();
    let b = signup(&app, "b@example.com", "correcthorsebattery").await.1["token"]
        .as_str().unwrap().to_string();
    set_username(&app, &a, "aaa").await;
    set_username(&app, &b, "bbb").await;

    call(&app, "POST", "/api/social/requests", Some(&a), Some(json!({ "username": "bbb" }))).await;
    // B requests A back → πρέπει να γίνει auto-accept.
    let (status, body) = call(&app, "POST", "/api/social/requests", Some(&b),
        Some(json!({ "username": "aaa" }))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "accepted");

    let (_, fa) = call(&app, "GET", "/api/social/friends", Some(&a), None).await;
    assert_eq!(fa.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn social_unknown_username_uniform_not_found() {
    let (app, _state, _dir) = test_app(None).await;
    let a = signup(&app, "a@example.com", "correcthorsebattery").await.1["token"]
        .as_str().unwrap().to_string();

    let (status, _) = call(&app, "POST", "/api/social/requests", Some(&a),
        Some(json!({ "username": "ghost_user" }))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // Self-add → επίσης uniform not-found.
    set_username(&app, &a, "aaa").await;
    let (status, _) = call(&app, "POST", "/api/social/requests", Some(&a),
        Some(json!({ "username": "aaa" }))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn social_stats_server_authoritative_and_clamped() {
    let (app, _state, _dir) = test_app(None).await;
    let a = signup(&app, "a@example.com", "correcthorsebattery").await.1["token"]
        .as_str().unwrap().to_string();

    // xp=10000 → level = floor(sqrt(10000/100))+1 = floor(10)+1 = 11, tier alpine.
    let (status, body) = publish_stats(&app, &a, 10_000).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["level"], 11);
    assert_eq!(body["tier"], "alpine");
    assert_eq!(body["xp"], 10_000);

    // Αρνητικό xp → clamp σε 0, level 1.
    let (_, body) = publish_stats(&app, &a, -5).await;
    assert_eq!(body["xp"], 0);
    assert_eq!(body["level"], 1);
}

#[tokio::test]
async fn social_leaderboard_privacy_global_vs_friends() {
    let (app, _state, _dir) = test_app(None).await;
    let a = signup(&app, "a@example.com", "correcthorsebattery").await.1["token"]
        .as_str().unwrap().to_string();
    let b = signup(&app, "b@example.com", "correcthorsebattery").await.1["token"]
        .as_str().unwrap().to_string();
    let c = signup(&app, "c@example.com", "correcthorsebattery").await.1["token"]
        .as_str().unwrap().to_string();
    set_username(&app, &a, "aaa").await;
    set_username(&app, &b, "bbb").await;
    set_username(&app, &c, "ccc").await;
    publish_stats(&app, &a, 100).await;
    publish_stats(&app, &b, 200).await;
    publish_stats(&app, &c, 300).await;

    // B κάνει το προφίλ του δημόσιο· C μένει ιδιωτικό.
    call(&app, "POST", "/api/social/profile", Some(&b), Some(json!({ "share_profile": true }))).await;

    // Global από τον A: βλέπει self (A) + B (shared)· ΟΧΙ C (ιδιωτικό).
    let (status, body) = call(&app, "GET", "/api/social/leaderboard?scope=global", Some(&a), None).await;
    assert_eq!(status, StatusCode::OK);
    let names: Vec<String> = body.as_array().unwrap().iter()
        .map(|r| r["username"].as_str().unwrap_or("").to_string()).collect();
    assert!(names.contains(&"aaa".to_string()));
    assert!(names.contains(&"bbb".to_string()));
    assert!(!names.contains(&"ccc".to_string()), "ιδιωτικό προφίλ ΔΕΝ φαίνεται global");

    // Friends scope χωρίς φίλους: μόνο ο εαυτός.
    let (_, body) = call(&app, "GET", "/api/social/leaderboard?scope=friends", Some(&a), None).await;
    assert_eq!(body.as_array().unwrap().len(), 1);
    assert_eq!(body[0]["username"], "aaa");
    assert_eq!(body[0]["is_self"], true);
}

#[tokio::test]
async fn social_public_profile_respects_privacy() {
    let (app, _state, _dir) = test_app(None).await;
    let a = signup(&app, "a@example.com", "correcthorsebattery").await.1["token"]
        .as_str().unwrap().to_string();
    let b = signup(&app, "b@example.com", "correcthorsebattery").await.1["token"]
        .as_str().unwrap().to_string();
    set_username(&app, &a, "aaa").await;
    set_username(&app, &b, "bbb").await;
    publish_stats(&app, &b, 400).await;

    // B ιδιωτικό → ο A (μη φίλος) παίρνει 404.
    let (status, _) = call(&app, "GET", "/api/social/user/bbb", Some(&a), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // B γίνεται δημόσιο → ορατό.
    call(&app, "POST", "/api/social/profile", Some(&b), Some(json!({ "share_profile": true }))).await;
    let (status, body) = call(&app, "GET", "/api/social/user/bbb", Some(&a), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["username"], "bbb");
    assert_eq!(body["level"], 3); // xp=400 → floor(sqrt(4))+1 = 3
    // Καμία διαρροή raw δεδομένων / email.
    assert!(body.get("email").is_none());
}

#[tokio::test]
async fn social_remove_friend_clears_edge() {
    let (app, _state, _dir) = test_app(None).await;
    let a = signup(&app, "a@example.com", "correcthorsebattery").await.1["token"]
        .as_str().unwrap().to_string();
    let b = signup(&app, "b@example.com", "correcthorsebattery").await.1["token"]
        .as_str().unwrap().to_string();
    set_username(&app, &a, "aaa").await;
    set_username(&app, &b, "bbb").await;
    call(&app, "POST", "/api/social/requests", Some(&a), Some(json!({ "username": "bbb" }))).await;
    call(&app, "POST", "/api/social/requests", Some(&b), Some(json!({ "username": "aaa" }))).await;

    // A's /me id για το remove.
    let (_, reqs) = call(&app, "GET", "/api/social/friends", Some(&a), None).await;
    let b_id = reqs[0]["account_id"].as_str().unwrap().to_string();

    let (status, _) = call(&app, "POST", &format!("/api/social/friends/{b_id}/remove"), Some(&a), None).await;
    assert_eq!(status, StatusCode::OK);

    let (_, fa) = call(&app, "GET", "/api/social/friends", Some(&a), None).await;
    assert_eq!(fa.as_array().unwrap().len(), 0);
    let (_, fb) = call(&app, "GET", "/api/social/friends", Some(&b), None).await;
    assert_eq!(fb.as_array().unwrap().len(), 0);
}

/// Το `db_size_bytes` ήταν `metadata(main).unwrap_or(0)` ενώ η βάση τρέχει σε
/// WAL mode: το σκέτο main αρχείο υποτιμά, και το `unwrap_or(0)` έλεγε ψέματα
/// («0 bytes») όταν το αρχείο δεν διαβαζόταν. Τώρα αθροίζει τα sidecars και
/// γυρνά `null` αντί για ψεύτικο μηδέν.
#[tokio::test]
async fn admin_stats_reports_account_breakdown_and_real_db_size() {
    let (app, _state, _dir) = test_app(Some("admin@example.com")).await;

    let (_, admin_body) = signup(&app, "admin@example.com", "correcthorsebattery").await;
    let admin_token = admin_body["token"].as_str().unwrap().to_string();

    let (_, user_body) = signup(&app, "target@example.com", "correcthorsebattery").await;
    let user_id = user_body["account"]["id"].as_str().unwrap().to_string();

    let (status, body) = call(&app, "GET", "/api/admin/stats", Some(&admin_token), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["accounts"], 2);
    assert_eq!(body["active_accounts"], 2);
    assert_eq!(body["disabled_accounts"], 0);
    assert_eq!(body["admins"], 1);
    // Δύο signups = δύο ενεργά sessions.
    assert_eq!(body["sessions"], 2);
    assert!(
        body["db_size_bytes"].as_i64().unwrap() > 0,
        "το μέγεθος της βάσης πρέπει να είναι πραγματικός αριθμός, πήρα {}",
        body["db_size_bytes"]
    );

    // Μετά το disable μετακινείται από active σε disabled, και το session του
    // χρήστη έχει σκοτωθεί.
    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/admin/users/{user_id}/disable"),
        Some(&admin_token),
        Some(json!({ "disabled": true })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (_, body) = call(&app, "GET", "/api/admin/stats", Some(&admin_token), None).await;
    assert_eq!(body["accounts"], 2);
    assert_eq!(body["active_accounts"], 1);
    assert_eq!(body["disabled_accounts"], 1);
    assert_eq!(body["sessions"], 1);
}

/// Η λίστα λέει «πόσες εγγραφές»· αυτό λέει «τι εγγραφές». Χωρίς το breakdown
/// ένας admin δεν μπορεί να δει ότι λείπει ολόκληρη κατηγορία από το sync ενός
/// χρήστη.
#[tokio::test]
async fn admin_user_rows_breaks_down_by_table() {
    let (app, _state, _dir) = test_app(Some("admin@example.com")).await;

    let (_, admin_body) = signup(&app, "admin@example.com", "correcthorsebattery").await;
    let admin_token = admin_body["token"].as_str().unwrap().to_string();

    let (_, user_body) = signup(&app, "target@example.com", "correcthorsebattery").await;
    let user_token = user_body["token"].as_str().unwrap().to_string();
    let user_id = user_body["account"]["id"].as_str().unwrap().to_string();

    let (status, _) = call(
        &app,
        "POST",
        "/api/sync/push",
        Some(&user_token),
        Some(json!({
            "changes": [
                { "tbl": "goals", "rows": [
                    { "id": "g1", "user_id": user_id, "v": 1 },
                    { "id": "g2", "user_id": user_id, "v": 1, "deleted_at": "2026-01-01T00:00:00Z" }
                ] },
                { "tbl": "workouts", "rows": [
                    { "id": "w1", "user_id": user_id, "v": 1 }
                ] }
            ]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = call(
        &app,
        "GET",
        &format!("/api/admin/users/{user_id}/rows"),
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let rows = body.as_array().unwrap();
    // Ταξινομημένα φθίνουσα κατά πλήθος → goals (2) πριν από workouts (1).
    assert_eq!(rows[0]["tbl"], "goals");
    assert_eq!(rows[0]["row_count"], 2);
    assert_eq!(rows[0]["deleted_count"], 1);
    assert_eq!(rows[1]["tbl"], "workouts");
    assert_eq!(rows[1]["row_count"], 1);
    assert_eq!(rows[1]["deleted_count"], 0);

    // Άγνωστο id = 404, ΟΧΙ «άδειος χρήστης».
    let (status, _) = call(
        &app,
        "GET",
        "/api/admin/users/does-not-exist/rows",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // Μη-admin δεν το βλέπει καθόλου.
    let (status, _) = call(
        &app,
        "GET",
        &format!("/api/admin/users/{user_id}/rows"),
        Some(&user_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

/// Οι ΜΕΡΕΣ του προγράμματος έλειπαν από το ALLOWED_TABLES ενώ οι ασκήσεις τους
/// περνούσαν κανονικά: σε δεύτερη συσκευή τα program_exercises κατέληγαν με
/// `program_day_id` που έδειχνε σε μέρα που δεν είχε φτάσει ποτέ.
#[tokio::test]
async fn sync_accepts_program_days_alongside_their_exercises() {
    let (app, _state, _dir) = test_app(None).await;

    let (_, body) = signup(&app, "days@example.com", "correcthorsebattery").await;
    let token = body["token"].as_str().unwrap().to_string();
    let user_id = body["account"]["id"].as_str().unwrap().to_string();

    let day = json!({
        "id": "day-1", "user_id": user_id, "program_id": "prog-1",
        "name": "Upper", "position": 0,
        "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z"
    });
    let exercise = json!({
        "id": "pe-1", "user_id": user_id, "program_id": "prog-1",
        "program_day_id": "day-1", "exercise_id": "ex-1", "position": 0,
        "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z"
    });

    let (status, _) = call(
        &app,
        "POST",
        "/api/sync/push",
        Some(&token),
        Some(json!({ "changes": [
            { "tbl": "program_days", "rows": [day] },
            { "tbl": "program_exercises", "rows": [exercise] }
        ]})),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "τα program_days πρέπει να γίνονται δεκτά");

    let (status, body) = call(
        &app,
        "POST",
        "/api/sync/pull",
        Some(&token),
        Some(json!({ "cursor": 0 })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let changes = body["changes"].as_array().unwrap();
    let days = changes
        .iter()
        .find(|c| c["tbl"] == "program_days")
        .expect("η δεύτερη συσκευή πρέπει να κατεβάζει τις μέρες");
    assert_eq!(days["rows"][0]["name"], "Upper");

    // Και η άσκηση δείχνει στη μέρα που όντως ταξίδεψε μαζί της.
    let exercises = changes.iter().find(|c| c["tbl"] == "program_exercises").unwrap();
    assert_eq!(exercises["rows"][0]["program_day_id"], "day-1");
}

/// Ο guard `wrong_user` ισχύει και για τον νέο πίνακα — μια μέρα με ξένο
/// user_id δεν πρέπει να μπορεί να γραφτεί στον λογαριασμό μου.
#[tokio::test]
async fn sync_rejects_program_day_of_another_user() {
    let (app, _state, _dir) = test_app(None).await;

    let (_, body) = signup(&app, "owner@example.com", "correcthorsebattery").await;
    let token = body["token"].as_str().unwrap().to_string();

    let (status, body) = call(
        &app,
        "POST",
        "/api/sync/push",
        Some(&token),
        Some(json!({ "changes": [{ "tbl": "program_days", "rows": [{
            "id": "day-x", "user_id": "somebody-else", "program_id": "prog-1",
            "name": "Upper", "position": 0,
            "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z"
        }]}]})),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "wrong_user");
}

/* ═══════════════ Magic-link (passwordless email) login ═══════════════ */

fn test_email_config() -> EmailConfig {
    EmailConfig {
        host: "smtp.invalid.test".to_string(),
        port: 587,
        username: "test@example.com".to_string(),
        password: "test-pass".to_string(),
        from: "Anabasis <no-reply@example.com>".to_string(),
        public_url: "https://anabasis.axonos.dev".to_string(),
    }
}

async fn test_app_with_email(email: Option<EmailConfig>) -> (Router, AppState, tempfile::TempDir) {
    let dir = tempfile::tempdir().expect("tempdir");
    let db_path = dir.path().join("anabasis-test.db");
    let state = build_state(db_path, None, None, None, email)
        .await
        .expect("build_state");
    let app = router(state.clone());
    (app, state, dir)
}

async fn insert_login_token(state: &AppState, raw_token: &str, email: &str, expires_at: &str) {
    let hash = anabasis_api::auth::sha256_hex(raw_token);
    sqlx::query(
        "INSERT INTO login_tokens (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(&hash)
    .bind(email)
    .bind("2026-01-01T00:00:00Z")
    .bind(expires_at)
    .execute(&state.pool)
    .await
    .expect("insert login_token");
}

#[tokio::test]
async fn magic_dormant_by_default_reports_false_and_rejects() {
    let (app, _state, _dir) = test_app(None).await;

    let (status, body) = call(&app, "GET", "/api/auth/oauth/providers", None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["magic"], false);

    let (status, body) = call(
        &app,
        "POST",
        "/api/auth/magic/request",
        None,
        Some(json!({ "email": "x@example.com" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "email_login_unavailable");

    let (status, body) = call(
        &app,
        "POST",
        "/api/auth/magic/consume",
        None,
        Some(json!({ "token": "anything" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "email_login_unavailable");
}

#[tokio::test]
async fn magic_providers_reports_enabled_when_configured() {
    let (app, _state, _dir) = test_app_with_email(Some(test_email_config())).await;
    let (status, body) = call(&app, "GET", "/api/auth/oauth/providers", None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["magic"], true);
}

#[tokio::test]
async fn magic_consume_happy_path_creates_account_and_is_single_use() {
    let (app, state, _dir) = test_app_with_email(Some(test_email_config())).await;
    insert_login_token(&state, "raw-token-123", "newbie@example.com", "2999-01-01T00:00:00Z").await;

    let (status, body) = call(
        &app,
        "POST",
        "/api/auth/magic/consume",
        None,
        Some(json!({ "token": "raw-token-123" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["token"].as_str().is_some(), "consume επιστρέφει session token");
    assert_eq!(body["account"]["email"], "newbie@example.com");
    assert_eq!(body["account"]["role"], "user");
    let session_token = body["token"].as_str().unwrap().to_string();

    // Το session δουλεύει πραγματικά.
    let (status, me) = call(&app, "GET", "/api/me", Some(&session_token), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me["email"], "newbie@example.com");

    // Single-use: δεύτερη εξαργύρωση του ίδιου token αποτυγχάνει.
    let (status, body) = call(
        &app,
        "POST",
        "/api/auth/magic/consume",
        None,
        Some(json!({ "token": "raw-token-123" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "invalid_token");
}

#[tokio::test]
async fn magic_consume_rejects_expired_token() {
    let (app, state, _dir) = test_app_with_email(Some(test_email_config())).await;
    insert_login_token(&state, "old-token", "late@example.com", "2000-01-01T00:00:00Z").await;

    let (status, body) = call(
        &app,
        "POST",
        "/api/auth/magic/consume",
        None,
        Some(json!({ "token": "old-token" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "expired_token");
}

#[tokio::test]
async fn magic_request_throttle_is_silent_and_sends_no_new_token() {
    let (app, state, _dir) = test_app_with_email(Some(test_email_config())).await;
    let email = "bomb@example.com";

    // Πρόσφατο token (created_at = τώρα) → η επόμενη request πέφτει στο
    // anti-bombing throttle ΠΡΙΝ φτάσει στο (αδύνατο, smtp.invalid.test) send.
    sqlx::query(
        "INSERT INTO login_tokens (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(anabasis_api::auth::sha256_hex("seed-token"))
    .bind(email)
    .bind(anabasis_api::util::now_iso())
    .bind(anabasis_api::util::iso_in(time_minutes(15)))
    .execute(&state.pool)
    .await
    .unwrap();

    let (status, body) = call(
        &app,
        "POST",
        "/api/auth/magic/request",
        None,
        Some(json!({ "email": email })),
    )
    .await;
    // Σιωπηλό OK — δεν αποκαλύπτει throttle, δεν σπάει σε 500 από το send.
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["ok"], true);

    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM login_tokens WHERE email = ?")
            .bind(email)
            .fetch_one(&state.pool)
            .await
            .unwrap();
    assert_eq!(count, 1, "throttled request δεν δημιουργεί δεύτερο token");
}

#[tokio::test]
async fn magic_request_rejects_invalid_email() {
    let (app, _state, _dir) = test_app_with_email(Some(test_email_config())).await;
    let (status, body) = call(
        &app,
        "POST",
        "/api/auth/magic/request",
        None,
        Some(json!({ "email": "not-an-email" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "invalid_email");
}

/* ═══════════════ Sync durability: tombstones, in-batch LWW, program round-trips ═══════════════ */

fn time_minutes(m: i64) -> time::Duration {
    time::Duration::minutes(m)
}

/// Ρητή περίπτωση που η παλιά suite δεν κάλυπτε: μια διαγραφή ΠΡΕΠΕΙ να μείνει
/// διαγραφή όταν φτάνει αργότερα ένα stale (παλιότερο) push που «αναστήνει» το
/// row. Χωρίς σωστό LWW-over-delete, μια offline συσκευή θα ξανάφερνε στη ζωή
/// ένα σβησμένο workout.
#[tokio::test]
async fn tombstone_stays_deleted_against_stale_resurrect() {
    let (app, state, _dir) = test_app(None).await;
    let (token, user_id) = signed_in_user(&app).await;

    // create @ 10:00
    let create = json!({ "id": "r1", "user_id": user_id, "title": "live", "updated_at": "2026-08-30T10:00:00.000Z", "deleted_at": null });
    call(&app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [{ "tbl": "goals", "rows": [create] }] }))).await;

    // delete @ 10:10 (νεότερο) — tombstone
    let delete = json!({ "id": "r1", "user_id": user_id, "title": "live", "updated_at": "2026-08-30T10:10:00.000Z", "deleted_at": "2026-08-30T10:10:00.000Z" });
    let (status, _) = call(&app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [{ "tbl": "goals", "rows": [delete] }] }))).await;
    assert_eq!(status, StatusCode::OK);

    // stale resurrect @ 10:05 (< 10:10) — LWW loser, δεν πρέπει να αναστήσει.
    let resurrect = json!({ "id": "r1", "user_id": user_id, "title": "back", "updated_at": "2026-08-30T10:05:00.000Z", "deleted_at": null });
    let (status, _) = call(&app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [{ "tbl": "goals", "rows": [resurrect] }] }))).await;
    assert_eq!(status, StatusCode::OK, "stale resurrect γίνεται δεκτό — απλώς χάνει");

    let (deleted, payload): (i64, String) = sqlx::query_as(
        "SELECT deleted, payload FROM sync_rows WHERE account_id = ? AND tbl = 'goals' AND row_id = 'r1'",
    )
    .bind(&user_id)
    .fetch_one(&state.pool)
    .await
    .unwrap();
    assert_eq!(deleted, 1, "παραμένει tombstone");
    let stored: Value = serde_json::from_str(&payload).unwrap();
    assert_eq!(stored["title"], "live", "το stale 'back' ΔΕΝ κέρδισε");
    assert!(!stored["deleted_at"].is_null(), "το deleted_at παραμένει");
}

/// Το αντίστροφο: μια ΓΝΗΣΙΑ νεότερη επεξεργασία μετά τη διαγραφή ΠΡΕΠΕΙ να
/// επαναφέρει το row (η διαγραφή δεν είναι μόνιμο κλείδωμα — απλό LWW).
#[tokio::test]
async fn tombstone_resurrects_when_newer_edit_arrives() {
    let (app, state, _dir) = test_app(None).await;
    let (token, user_id) = signed_in_user(&app).await;

    let delete = json!({ "id": "r2", "user_id": user_id, "updated_at": "2026-08-30T10:10:00.000Z", "deleted_at": "2026-08-30T10:10:00.000Z" });
    call(&app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [{ "tbl": "goals", "rows": [delete] }] }))).await;

    let revive = json!({ "id": "r2", "user_id": user_id, "title": "revived", "updated_at": "2026-08-30T10:20:00.000Z", "deleted_at": null });
    let (status, _) = call(&app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [{ "tbl": "goals", "rows": [revive] }] }))).await;
    assert_eq!(status, StatusCode::OK);

    let deleted: i64 = sqlx::query_scalar(
        "SELECT deleted FROM sync_rows WHERE account_id = ? AND tbl = 'goals' AND row_id = 'r2'",
    )
    .bind(&user_id)
    .fetch_one(&state.pool)
    .await
    .unwrap();
    assert_eq!(deleted, 0, "νεότερη επεξεργασία επαναφέρει το row");
}

/// Δύο εκδοχές του ΙΔΙΟΥ row μέσα σε ΕΝΑ push (π.χ. batched offline edits που
/// έφτασαν εκτός σειράς): πρέπει να επικρατεί το νεότερο ακόμα κι αν φτάνει
/// ΠΡΩΤΟ στο array — ελέγχει το intra-transaction read visibility.
#[tokio::test]
async fn same_row_twice_in_one_push_resolves_by_lww_within_batch() {
    let (app, state, _dir) = test_app(None).await;
    let (token, user_id) = signed_in_user(&app).await;

    let (status, body) = call(&app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [{ "tbl": "goals", "rows": [
            { "id": "rb", "user_id": &user_id, "title": "new", "updated_at": "2026-08-30T10:10:00.000Z" },
            { "id": "rb", "user_id": &user_id, "title": "old", "updated_at": "2026-08-30T10:00:00.000Z" },
        ] }] }))).await;
    assert_eq!(status, StatusCode::OK);
    // Ένα μόνο write κατανάλωσε seq (το δεύτερο έχασε).
    assert_eq!(body["cursor"].as_i64().unwrap(), 1);

    let payload: String = sqlx::query_scalar(
        "SELECT payload FROM sync_rows WHERE account_id = ? AND tbl = 'goals' AND row_id = 'rb'",
    )
    .bind(&user_id)
    .fetch_one(&state.pool)
    .await
    .unwrap();
    let stored: Value = serde_json::from_str(&payload).unwrap();
    assert_eq!(stored["title"], "new", "το νεότερο κέρδισε παρότι ήρθε πρώτο");
}

/// Πλήρες cross-device round-trip για programs: update (LWW) + soft-delete
/// ταξιδεύουν σωστά στο pull (πέρα από το γενικό accepts-test).
#[tokio::test]
async fn program_day_update_then_soft_delete_round_trips() {
    let (app, _state, _dir) = test_app(None).await;
    let (token, user_id) = signed_in_user(&app).await;

    let v1 = json!({ "id": "d1", "user_id": &user_id, "program_id": "p1", "name": "Upper", "position": 0, "updated_at": "2026-01-01T00:00:00.000Z" });
    call(&app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [{ "tbl": "program_days", "rows": [v1] }] }))).await;

    // update @ νεότερο → όνομα αλλάζει
    let v2 = json!({ "id": "d1", "user_id": &user_id, "program_id": "p1", "name": "Lower", "position": 0, "updated_at": "2026-01-02T00:00:00.000Z" });
    call(&app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [{ "tbl": "program_days", "rows": [v2] }] }))).await;

    let (_, body) = call(&app, "POST", "/api/sync/pull", Some(&token), Some(json!({ "cursor": 0 }))).await;
    let days = body["changes"].as_array().unwrap().iter().find(|c| c["tbl"] == "program_days").unwrap();
    assert_eq!(days["rows"][0]["name"], "Lower", "device B κατεβάζει την ενημερωμένη μέρα");

    // soft-delete → tombstone ταξιδεύει
    let del = json!({ "id": "d1", "user_id": &user_id, "program_id": "p1", "name": "Lower", "position": 0, "updated_at": "2026-01-03T00:00:00.000Z", "deleted_at": "2026-01-03T00:00:00.000Z" });
    call(&app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [{ "tbl": "program_days", "rows": [del] }] }))).await;

    let (_, body) = call(&app, "POST", "/api/sync/pull", Some(&token), Some(json!({ "cursor": 0 }))).await;
    let days = body["changes"].as_array().unwrap().iter().find(|c| c["tbl"] == "program_days").unwrap();
    assert!(!days["rows"][0]["deleted_at"].is_null(), "η διαγραφή της μέρας ταξιδεύει cross-device");
}

/* ═══════════════ Per-account row quota (abusive-growth guard) ═══════════════ */

async fn test_app_with_quota(quota: i64) -> (Router, AppState, tempfile::TempDir) {
    let dir = tempfile::tempdir().expect("tempdir");
    let db_path = dir.path().join("anabasis-test.db");
    let mut state = build_state(db_path, None, None, None, None)
        .await
        .expect("build_state");
    state.max_rows_per_account = quota;
    let app = router(state.clone());
    (app, state, dir)
}

#[tokio::test]
async fn push_rejects_new_rows_beyond_account_quota() {
    let (app, state, _dir) = test_app_with_quota(2).await;
    let (token, user_id) = signed_in_user(&app).await;

    // 2 νέα rows → φτάνουμε ΑΚΡΙΒΩΣ στο cap.
    let (status, _) = call(&app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [{ "tbl": "goals", "rows": [
            { "id": "g1", "user_id": &user_id, "updated_at": "2026-01-01T00:00:00Z" },
            { "id": "g2", "user_id": &user_id, "updated_at": "2026-01-01T00:00:00Z" },
        ] }] }))).await;
    assert_eq!(status, StatusCode::OK);

    // 3ο ΝΕΟ row → quota_exceeded (507), τίποτα δεν γράφεται (rollback).
    let (status, body) = call(&app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [{ "tbl": "goals", "rows": [
            { "id": "g3", "user_id": &user_id, "updated_at": "2026-01-01T00:00:00Z" },
        ] }] }))).await;
    assert_eq!(status, StatusCode::INSUFFICIENT_STORAGE);
    assert_eq!(body["error"], "quota_exceeded");

    let g3_present: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM sync_rows WHERE account_id = ? AND row_id = 'g3'",
    )
    .bind(&user_id)
    .fetch_optional(&state.pool)
    .await
    .unwrap();
    assert!(g3_present.is_none(), "το απορριφθέν row δεν γράφτηκε");

    // Στο cap, UPDATE υπαρκτού row (δεν αυξάνει πλήθος) → επιτρέπεται.
    let (status, _) = call(&app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [{ "tbl": "goals", "rows": [
            { "id": "g1", "user_id": &user_id, "title": "updated", "updated_at": "2026-06-01T00:00:00Z" },
        ] }] }))).await;
    assert_eq!(status, StatusCode::OK, "updates επιτρέπονται ακόμα στο cap");

    // Στο cap, DELETE υπαρκτού row → επιτρέπεται (soft-delete = update).
    let (status, _) = call(&app, "POST", "/api/sync/push", Some(&token),
        Some(json!({ "changes": [{ "tbl": "goals", "rows": [
            { "id": "g2", "user_id": &user_id, "updated_at": "2026-06-02T00:00:00Z", "deleted_at": "2026-06-02T00:00:00Z" },
        ] }] }))).await;
    assert_eq!(status, StatusCode::OK, "deletes επιτρέπονται ακόμα στο cap");
}

/* ═══════════════ Tombstone GC (admin-gated) ═══════════════ */

#[tokio::test]
async fn admin_gc_prunes_old_tombstones_keeps_recent_and_live() {
    let (app, state, _dir) = test_app(Some("admin@example.com")).await;
    let (_, body) = signup(&app, "admin@example.com", "correcthorsebattery").await;
    let admin_token = body["token"].as_str().unwrap().to_string();
    let admin_id = body["account"]["id"].as_str().unwrap().to_string();

    // Άμεση εισαγωγή τριών rows με ελεγχόμενο server_updated_at:
    //  - live (deleted=0)                    → ΠΟΤΕ δεν κόβεται
    //  - παλιό tombstone (200 μέρες πριν)     → κόβεται σε horizon 90
    //  - πρόσφατο tombstone (τώρα)            → μένει
    for (rid, seq, deleted, sua) in [
        ("r-live", 1, 0, anabasis_api::util::now_iso()),
        ("r-old", 2, 1, anabasis_api::util::iso_days_ago(200)),
        ("r-recent", 3, 1, anabasis_api::util::now_iso()),
    ] {
        sqlx::query(
            "INSERT INTO sync_rows (account_id, tbl, row_id, payload, seq, deleted, server_updated_at)
             VALUES (?, 'goals', ?, '{}', ?, ?, ?)",
        )
        .bind(&admin_id)
        .bind(rid)
        .bind(seq as i64)
        .bind(deleted as i64)
        .bind(sua)
        .execute(&state.pool)
        .await
        .unwrap();
    }

    let (status, body) = call(&app, "POST", "/api/admin/gc?horizon_days=90", Some(&admin_token), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["pruned"].as_u64().unwrap(), 1, "μόνο το παλιό tombstone κόβεται");
    assert_eq!(body["horizon_days"].as_i64().unwrap(), 90);

    let remaining: Vec<String> = sqlx::query_scalar(
        "SELECT row_id FROM sync_rows WHERE account_id = ? ORDER BY row_id",
    )
    .bind(&admin_id)
    .fetch_all(&state.pool)
    .await
    .unwrap();
    assert_eq!(remaining, vec!["r-live".to_string(), "r-recent".to_string()]);
}

#[tokio::test]
async fn admin_gc_clamps_horizon_to_safe_minimum() {
    let (app, _state, _dir) = test_app(Some("admin@example.com")).await;
    let (_, body) = signup(&app, "admin@example.com", "correcthorsebattery").await;
    let admin_token = body["token"].as_str().unwrap().to_string();

    // Ζητάμε επικίνδυνα μικρό horizon (0) → clamp στο ελάχιστο ασφαλές (7).
    let (status, body) = call(&app, "POST", "/api/admin/gc?horizon_days=0", Some(&admin_token), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["horizon_days"].as_i64().unwrap(), 7, "horizon clamped στο ελάχιστο");
}

#[tokio::test]
async fn admin_gc_requires_admin() {
    let (app, _state, _dir) = test_app(None).await;
    let (token, _user_id) = signed_in_user(&app).await;
    let (status, _) = call(&app, "POST", "/api/admin/gc", Some(&token), None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

/* ═══════════════ Password/email length DoS caps ═══════════════ */

#[tokio::test]
async fn signup_rejects_overlong_password() {
    let (app, _state, _dir) = test_app(None).await;
    let long = "a".repeat(2000);
    let (status, body) = signup(&app, "big@example.com", &long).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "weak_password");
}

#[tokio::test]
async fn login_overlong_password_is_bad_credentials_without_enumeration() {
    let (app, _state, _dir) = test_app(None).await;
    let (status, _) = signup(&app, "real@example.com", "correcthorsebattery").await;
    assert_eq!(status, StatusCode::OK);

    let long = "a".repeat(2000);
    // Υπαρκτό email + over-length pass → 401 bad_credentials (χωρίς ακριβό hash).
    let (status_known, body_known) = login(&app, "real@example.com", &long).await;
    // Άγνωστο email + over-length pass → ΙΔΙΟ αποτέλεσμα (no enumeration).
    let (status_unknown, body_unknown) = login(&app, "ghost@example.com", &long).await;
    assert_eq!(status_known, StatusCode::UNAUTHORIZED);
    assert_eq!(status_unknown, StatusCode::UNAUTHORIZED);
    assert_eq!(body_known, body_unknown);
    assert_eq!(body_known["error"], "bad_credentials");
}
