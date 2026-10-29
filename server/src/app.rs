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

use crate::{admin, auth, magic, oauth, social, sync};

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

/// SMTP config για magic-link email. `AppState.email == None` σημαίνει το
/// feature είναι πλήρως δορμάν (providers→magic:false, request→503), όπως το
/// Google OAuth χωρίς creds. Ορίζεται από τα ANABASIS_SMTP_* env vars (main.rs).
#[derive(Debug, Clone)]
pub struct EmailConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    /// From-address (π.χ. `Anabasis <no-reply@axonos.dev>`).
    pub from: String,
    /// Base για το link στο email — ίδιο public_url με το OAuth.
    pub public_url: String,
}

impl EmailConfig {
    /// Resolve SMTP config from an env-style lookup. Accepts BOTH the canonical
    /// `ANABASIS_SMTP_*` names and the shared `SMTP_*` names used by the axonos
    /// `email.env` (Gmail app password), so a single `EnvironmentFile=` can
    /// supply either without copying secret values into this repo. Returns
    /// `None` (feature dormant) unless host + username + password are all set
    /// and non-empty. Pure over `get` so it is unit-testable without real env.
    pub fn resolve(get: impl Fn(&str) -> Option<String>) -> Option<EmailConfig> {
        let pick = |keys: &[&str]| -> Option<String> {
            keys.iter()
                .filter_map(|k| get(k))
                .map(|v| v.trim().to_string())
                .find(|v| !v.is_empty())
        };

        let host = pick(&["ANABASIS_SMTP_HOST", "SMTP_HOST"])?;
        let username = pick(&["ANABASIS_SMTP_USERNAME", "SMTP_USER"])?;
        let password = pick(&["ANABASIS_SMTP_PASSWORD", "SMTP_PASS"])?;

        let port = pick(&["ANABASIS_SMTP_PORT", "SMTP_PORT"])
            .and_then(|s| s.parse().ok())
            .unwrap_or(587);
        let public_url =
            pick(&["ANABASIS_PUBLIC_URL"]).unwrap_or_else(|| "https://anabasis.axonos.dev".into());
        // From: explicit ANABASIS_SMTP_FROM wins; else build from the shared
        // SMTP_FROM (+ optional display name); else fall back to the SMTP user.
        let from = pick(&["ANABASIS_SMTP_FROM"])
            .or_else(|| {
                pick(&["SMTP_FROM"]).map(|addr| match pick(&["SMTP_FROM_NAME"]) {
                    Some(name) => format!("{name} <{addr}>"),
                    None => addr,
                })
            })
            .unwrap_or_else(|| format!("Anabasis <{username}>"));

        Some(EmailConfig {
            host,
            port,
            username,
            password,
            from,
            public_url,
        })
    }
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
    /// Πίσω από cloudflared, το `CF-Connecting-IP` είναι αξιόπιστο μόνο όταν
    /// το API ακούει σε loopback (default). Το main.rs το κλείνει αυτόματα σε
    /// άλλο bind, εκτός αν ζητηθεί ρητά με ANABASIS_TRUST_CF_IP=1.
    pub trust_cf_ip: bool,
    pub google_oauth: Option<GoogleOAuthConfig>,
    /// SMTP config για magic-link· None ⇒ δορμάν.
    pub email: Option<EmailConfig>,
    /// Ένα reused reqwest::Client (κρατάει connection pool/DNS cache) — μόνο
    /// για τα Google token/userinfo calls του oauth module.
    pub http_client: reqwest::Client,
    /// Ανώτατο πλήθος αποθηκευμένων sync_rows ανά λογαριασμό (abusive-growth
    /// φρένο· βλ. sync::push). Override μέσω ANABASIS_MAX_ROWS_PER_ACCOUNT.
    pub max_rows_per_account: i64,
}

/// Default όριο rows/λογαριασμό — γενναιόδωρο (ο βαρύτερος πραγματικός χρήστης
/// έχει λίγες χιλιάδες), αρκετά χαμηλό ώστε ένας κακόβουλος client να μη γεμίσει
/// τον δίσκο με εκατομμύρια rows.
const DEFAULT_MAX_ROWS_PER_ACCOUNT: i64 = 100_000;

/// Ανώτατο μέγεθος request body. Το axum default (2 MiB) είναι λίγο σφιχτό για
/// ένα πλήρες push βαρέος λογαριασμού· 4 MiB δίνει περιθώριο ΚΑΙ βάζει ρητό,
/// τεκμηριωμένο φράγμα (δεν βασιζόμαστε σε σιωπηρό default). Μαζί με το
/// MAX_PUSH_ROWS + το per-account quota, φράζει το write surface.
const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;

pub async fn build_state(
    db_path: PathBuf,
    admin_email: Option<String>,
    admin_code: Option<String>,
    google_oauth: Option<GoogleOAuthConfig>,
    email: Option<EmailConfig>,
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
        trust_cf_ip: true,
        admin_code_hash: admin_code
            .map(|c| c.trim().to_string())
            .filter(|c| !c.is_empty())
            .map(|c| crate::auth::sha256_hex(&c)),
        dummy_hash,
        started_at: OffsetDateTime::now_utc(),
        google_oauth,
        email,
        http_client: reqwest::Client::new(),
        max_rows_per_account: std::env::var("ANABASIS_MAX_ROWS_PER_ACCOUNT")
            .ok()
            .and_then(|v| v.trim().parse::<i64>().ok())
            .filter(|n| *n > 0)
            .unwrap_or(DEFAULT_MAX_ROWS_PER_ACCOUNT),
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
struct CfConnectingIpKeyExtractor {
    trust_cf_ip: bool,
}

impl KeyExtractor for CfConnectingIpKeyExtractor {
    type Key = IpAddr;

    fn extract<T>(&self, req: &axum::http::Request<T>) -> Result<Self::Key, GovernorError> {
        if self.trust_cf_ip {
            if let Some(ip) = req
                .headers()
                .get("cf-connecting-ip")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.trim().parse::<IpAddr>().ok())
            {
                return Ok(ip);
            }
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
        .key_extractor(CfConnectingIpKeyExtractor {
            trust_cf_ip: state.trust_cf_ip,
        })
        .period(Duration::from_secs(6)) // 10 req/min: burst 10, refill 1 ανά 6s
        .burst_size(10)
        .finish()
        .expect("έγκυρο governor config για auth");

    let sync_governor = GovernorConfigBuilder::default()
        .key_extractor(CfConnectingIpKeyExtractor {
            trust_cf_ip: state.trust_cf_ip,
        })
        .period(Duration::from_millis(500)) // 120 req/min: burst 120, refill 1 ανά 500ms
        .burst_size(120)
        .finish()
        .expect("έγκυρο governor config για sync");

    let auth_routes = Router::new()
        .route("/signup", post(auth::signup))
        .route("/login", post(auth::login))
        .route("/logout", post(auth::logout))
        .route("/logout_others", post(auth::logout_others))
        .route("/delete_account", post(auth::delete_account))
        .route("/change_password", post(auth::change_password))
        .route("/claim_admin", post(auth::claim_admin))
        .route("/oauth/providers", get(oauth::providers))
        .route("/oauth/google/start", get(oauth::google_start))
        .route("/oauth/google/callback", get(oauth::google_callback))
        .route("/magic/request", post(magic::request))
        .route("/magic/consume", post(magic::consume))
        .layer(GovernorLayer::new(auth_governor));

    let sync_routes = Router::new()
        .route("/push", post(sync::push))
        .route("/pull", post(sync::pull))
        .layer(GovernorLayer::new(sync_governor));

    // Social: πιο σφιχτό rate-limit (60/min) — το send_request είναι το κύριο
    // enumeration surface· uniform not-found + αυτό το όριο το καλύπτουν.
    let social_governor = GovernorConfigBuilder::default()
        .key_extractor(CfConnectingIpKeyExtractor {
            trust_cf_ip: state.trust_cf_ip,
        })
        .period(Duration::from_secs(1)) // 60 req/min: burst 60, refill 1 ανά 1s
        .burst_size(60)
        .finish()
        .expect("έγκυρο governor config για social");

    let social_routes = Router::new()
        .route("/me", get(social::me))
        .route("/profile", post(social::update_profile))
        .route("/stats", post(social::publish_stats))
        .route("/friends", get(social::friends))
        .route("/friends/{id}/remove", post(social::remove_friend))
        .route(
            "/requests",
            get(social::requests).post(social::send_request),
        )
        .route("/requests/{id}/accept", post(social::accept_request))
        .route("/leaderboard", get(social::leaderboard))
        .route("/search", get(social::search))
        .route("/user/{username}", get(social::public_profile))
        .route(
            "/public/user/{username}",
            get(social::public_profile_anonymous),
        )
        .layer(GovernorLayer::new(social_governor));

    let admin_routes = Router::new()
        .route("/users", get(admin::list_users))
        .route("/users/{id}/disable", post(admin::disable_user))
        .route("/users/{id}/reset_password", post(admin::reset_password))
        .route("/users/{id}/rows", get(admin::user_rows))
        .route("/stats", get(admin::stats))
        .route("/gc", post(admin::gc));

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
        .nest("/api/social", social_routes)
        .nest("/api/admin", admin_routes)
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        // Ρητό φράγμα σώματος (αντί για το σιωπηρό axum default) — defense in depth.
        .layer(axum::extract::DefaultBodyLimit::max(MAX_BODY_BYTES))
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

#[cfg(test)]
mod email_config_tests {
    use super::EmailConfig;
    use std::collections::HashMap;

    fn lookup(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> = pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        move |k: &str| map.get(k).cloned()
    }

    #[test]
    fn dormant_when_nothing_set() {
        assert!(EmailConfig::resolve(lookup(&[])).is_none());
    }

    #[test]
    fn dormant_when_password_missing() {
        let cfg = EmailConfig::resolve(lookup(&[
            ("ANABASIS_SMTP_HOST", "smtp.gmail.com"),
            ("ANABASIS_SMTP_USERNAME", "a@b.com"),
        ]));
        assert!(cfg.is_none());
    }

    #[test]
    fn empty_values_are_treated_as_unset() {
        let cfg = EmailConfig::resolve(lookup(&[
            ("ANABASIS_SMTP_HOST", "  "),
            ("ANABASIS_SMTP_USERNAME", "a@b.com"),
            ("ANABASIS_SMTP_PASSWORD", "pw"),
        ]));
        assert!(cfg.is_none());
    }

    #[test]
    fn canonical_anabasis_vars_resolve() {
        let cfg = EmailConfig::resolve(lookup(&[
            ("ANABASIS_SMTP_HOST", "smtp.gmail.com"),
            ("ANABASIS_SMTP_USERNAME", "user@gmail.com"),
            ("ANABASIS_SMTP_PASSWORD", "secretpw"),
            ("ANABASIS_SMTP_PORT", "2525"),
            ("ANABASIS_SMTP_FROM", "Anabasis <no-reply@axonos.dev>"),
        ]))
        .expect("should resolve");
        assert_eq!(cfg.host, "smtp.gmail.com");
        assert_eq!(cfg.username, "user@gmail.com");
        assert_eq!(cfg.password, "secretpw");
        assert_eq!(cfg.port, 2525);
        assert_eq!(cfg.from, "Anabasis <no-reply@axonos.dev>");
    }

    #[test]
    fn shared_smtp_vars_resolve_with_from_name() {
        // The axonos email.env shape: SMTP_* names, display name separate.
        let cfg = EmailConfig::resolve(lookup(&[
            ("SMTP_HOST", "smtp.gmail.com"),
            ("SMTP_USER", "axonos@gmail.com"),
            ("SMTP_PASS", "apppassword16ch"),
            ("SMTP_FROM", "no-reply@axonos.dev"),
            ("SMTP_FROM_NAME", "Anabasis"),
        ]))
        .expect("should resolve from shared vars");
        assert_eq!(cfg.host, "smtp.gmail.com");
        assert_eq!(cfg.username, "axonos@gmail.com");
        assert_eq!(cfg.port, 587, "defaults to 587 when no port given");
        assert_eq!(cfg.from, "Anabasis <no-reply@axonos.dev>");
    }

    #[test]
    fn canonical_vars_win_over_shared() {
        let cfg = EmailConfig::resolve(lookup(&[
            ("ANABASIS_SMTP_HOST", "canonical.example"),
            ("SMTP_HOST", "shared.example"),
            ("SMTP_USER", "u@e.com"),
            ("SMTP_PASS", "pw"),
        ]))
        .expect("resolves");
        assert_eq!(cfg.host, "canonical.example");
    }

    #[test]
    fn from_falls_back_to_username_when_absent() {
        let cfg = EmailConfig::resolve(lookup(&[
            ("SMTP_HOST", "smtp.gmail.com"),
            ("SMTP_USER", "solo@gmail.com"),
            ("SMTP_PASS", "pw"),
        ]))
        .expect("resolves");
        assert_eq!(cfg.from, "Anabasis <solo@gmail.com>");
    }
}
