use anabasis_api::app::{build_state, router, AppState};
use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use serde_json::{json, Value};
use tower::ServiceExt;

async fn test_app(admin_email: Option<&str>) -> (Router, AppState, tempfile::TempDir) {
    let dir = tempfile::tempdir().expect("tempdir");
    let db_path = dir.path().join("anabasis-test.db");
    let state = build_state(db_path, admin_email.map(str::to_string))
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
