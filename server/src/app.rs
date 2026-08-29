use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::time::Duration;

use argon2::{Argon2, PasswordHasher};
use axum::http::{header, HeaderValue, Method};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;
use time::OffsetDateTime;
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::key_extractor::KeyExtractor;
use tower_governor::{GovernorError, GovernorLayer};
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use crate::{admin, auth, oauth, sync};

/// "Sign in with Google" — παρών μόνο όταν έχουν οριστεί ΚΑΙ τα δύο env vars
/// (ANABASIS_GOOGLE_CLIENT_ID/SECRET, βλ. main.rs)· `AppState.google_oauth ==
/// None` σημαίνει το feature είναι πλήρως δορμάν (404 σε start/callback).
#[derive(Debug, Clone)]
pub struct GoogleOAuthConfig {
    pub client_id: String,
    pub client_secret: String,
    /// π.χ. `https://anabasis.axonos.dev` — base για το OAuth redirect_uri
    /// ΚΑΙ για το τελικό redirect προς τη SPA μετά το callback.
    pub public_url: String,
}

#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::SqlitePool,
    pub db_path: PathBuf,
    /// Lowercase-normalized· πρώτο signup με αυτό το email παίρνει role 'admin'.
    pub admin_email: Option<String>,
    /// Μυστικός κωδικός που προάγει ΟΠΟΙΟΝΔΗΠΟΤΕ λογαριασμό σε admin
    /// (POST /api/auth/claim_admin) — συγκρίνεται μέσω sha256, όχι raw.
    pub admin_code_hash: Option<String>,
    /// Προ-υπολογισμένο valid PHC hash — verify_password πάνω σε αυτό όταν το
    /// email δεν υπάρχει, ώστε το login να έχει ίδιο timing με λάθος password
    /// (no user enumeration μέσω timing).
    pub dummy_hash: String,
    pub started_at: OffsetDateTime,
    /// Ταυτότητα αυτής της βάσης (meta.epoch) — αλλάζει σε restore/recreate,
    /// ώστε οι clients να μηδενίζουν cursors αντί να ξεσυγχρονίζονται σιωπηλά.
    pub epoch: String,
    pub google_oauth: Option<GoogleOAuthConfig>,
    /// Ένα reused reqwest::Client (κρατάει connection pool/DNS cache) — μόνο
    /// για τα Google token/userinfo calls του oauth module.
    pub http_client: reqwest::Client,
}

pub async fn build_state(
    db_path: PathBuf,
    admin_email: Option<String>,
    admin_code: Option<String>,
    google_oauth: Option<GoogleOAuthConfig>,
) -> Result<AppState, sqlx::Error> {
    let pool = crate::db::connect(&db_path).await?;
    let epoch = crate::db::get_or_create_epoch(&pool).await?;
    let dummy_hash = Argon2::default()
        .hash_password(b"anabasis-dummy-timing-password")
        .map(|h| h.to_string())
        .map_err(|e| sqlx::Error::Configuration(e.to_string().into()))?;

    Ok(AppState {
        pool,
        db_path,
        admin_email: admin_email.map(|e| e.trim().to_lowercase()),
        epoch,
        admin_code_hash: admin_code
            .map(|c| c.trim().to_string())
            .filter(|c| !c.is_empty())
            .map(|c| crate::auth::sha256_hex(&c)),
        dummy_hash,
        started_at: OffsetDateTime::now_utc(),
        google_oauth,
        http_client: reqwest::Client::new(),
    })
}

const ALLOWED_ORIGINS: &[&str] = &[
    "https://anabasis.axonos.dev",
    "tauri://localhost",
    "http://tauri.localhost",
    "http://localhost:5173",
    "http://localhost:8120",
];

/// Rate-limit key: προτιμά `CF-Connecting-IP` (πίσω από cloudflared), αλλιώς
/// peer addr μέσω `ConnectInfo`. Ποτέ δεν αποτυγχάνει την εξαγωγή (fallback σε
/// ένα κοινό bucket) — απουσία peer info δεν πρέπει να σκάει σε 500.
#[derive(Debug, Clone, Copy)]
struct CfConnectingIpKeyExtractor;

impl KeyExtractor for CfConnectingIpKeyExtractor {
    type Key = IpAddr;

    fn extract<T>(&self, req: &axum::http::Request<T>) -> Result<Self::Key, GovernorError> {
        if let Some(ip) = req
            .headers()
            .get("cf-connecting-ip")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.trim().parse::<IpAddr>().ok())
        {
            return Ok(ip);
        }
        if let Some(connect_info) = req
            .extensions()
            .get::<axum::extract::ConnectInfo<SocketAddr>>()
        {
            return Ok(connect_info.0.ip());
        }
        Ok(IpAddr::V4(Ipv4Addr::UNSPECIFIED))
    }
}

pub fn router(state: AppState) -> Router {
    let auth_governor = GovernorConfigBuilder::default()
        .key_extractor(CfConnectingIpKeyExtractor)
        .period(Duration::from_secs(6)) // 10 req/min: burst 10, refill 1 ανά 6s
        .burst_size(10)
        .finish()
        .expect("έγκυρο governor config για auth");

    let sync_governor = GovernorConfigBuilder::default()
        .key_extractor(CfConnectingIpKeyExtractor)
        .period(Duration::from_millis(500)) // 120 req/min: burst 120, refill 1 ανά 500ms
        .burst_size(120)
        .finish()
        .expect("έγκυρο governor config για sync");

    let auth_routes = Router::new()
        .route("/signup", post(auth::signup))
        .route("/login", post(auth::login))
        .route("/logout", post(auth::logout))
        .route("/change_password", post(auth::change_password))
        .route("/claim_admin", post(auth::claim_admin))
        .route("/oauth/providers", get(oauth::providers))
        .route("/oauth/google/start", get(oauth::google_start))
        .route("/oauth/google/callback", get(oauth::google_callback))
        .layer(GovernorLayer::new(auth_governor));

    let sync_routes = Router::new()
        .route("/push", post(sync::push))
        .route("/pull", post(sync::pull))
        .layer(GovernorLayer::new(sync_governor));

    let admin_routes = Router::new()
        .route("/users", get(admin::list_users))
        .route("/users/{id}/disable", post(admin::disable_user))
        .route("/users/{id}/reset_password", post(admin::reset_password))
        .route("/stats", get(admin::stats));

    let allow_origin: Vec<HeaderValue> = ALLOWED_ORIGINS
        .iter()
        .map(|o| {
            o.parse()
                .expect("static allowlist origins είναι έγκυρα HeaderValue")
        })
        .collect();

    let cors = CorsLayer::new()
        .allow_origin(allow_origin)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);

    Router::new()
        .route("/api/health", get(health))
        .route("/api/me", get(auth::me))
        .nest("/api/auth", auth_routes)
        .nest("/api/sync", sync_routes)
        .nest("/api/admin", admin_routes)
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state)
}

#[derive(Serialize)]
struct HealthResponse {
    ok: bool,
    version: &'static str,
    epoch: String,
}

async fn health(axum::extract::State(state): axum::extract::State<AppState>) -> impl IntoResponse {
    Json(HealthResponse {
        ok: true,
        version: env!("CARGO_PKG_VERSION"),
        epoch: state.epoch.clone(),
    })
}

/// Βοηθητικό για main.rs: default path όταν δεν έχει οριστεί `ANABASIS_DB_PATH`.
pub fn default_db_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    Path::new(&home).join(".local/share/anabasis-server/anabasis.db")
}
