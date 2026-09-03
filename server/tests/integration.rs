use anabasis_api::app::{build_state, router, AppState, GoogleOAuthConfig};
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
    let s1 = build_state(db_path.clone(), None, None, None)
        .await
        .expect("s1");
    let s2 = build_state(db_path, None, None, None).await.expect("s2");
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
