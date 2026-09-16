use std::net::SocketAddr;
use std::path::PathBuf;

use anabasis_api::app::{build_state, default_db_path, router, EmailConfig, GoogleOAuthConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let db_path = std::env::var("ANABASIS_DB_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| default_db_path());
    let port: u16 = std::env::var("ANABASIS_API_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8121);
    let admin_email = std::env::var("ANABASIS_ADMIN_EMAIL").ok();

    let admin_code = std::env::var("ANABASIS_ADMIN_CODE").ok();

    /*
     * Δορμάν μέχρι να έχουν οριστεί ΚΑΙ τα δύο ANABASIS_GOOGLE_CLIENT_ID/
     * SECRET — δεν υπάρχουν ακόμα Google Cloud credentials (βλ. report).
     * Ζουν στο ίδιο EnvironmentFile με τα υπόλοιπα secrets του unit.
     */
    let google_client_id = std::env::var("ANABASIS_GOOGLE_CLIENT_ID").ok();
    let google_client_secret = std::env::var("ANABASIS_GOOGLE_CLIENT_SECRET").ok();
    let google_oauth = match (google_client_id, google_client_secret) {
        (Some(client_id), Some(client_secret))
            if !client_id.trim().is_empty() && !client_secret.trim().is_empty() =>
        {
            Some(GoogleOAuthConfig {
                client_id,
                client_secret,
                public_url: std::env::var("ANABASIS_PUBLIC_URL")
                    .unwrap_or_else(|_| "https://anabasis.axonos.dev".to_string()),
            })
        }
        _ => None,
    };

    /*
     * Magic-link email login — δορμάν μέχρι να οριστούν ΟΛΑ τα ANABASIS_SMTP_*
     * (host/user/pass). Ίδιο EnvironmentFile με τα υπόλοιπα secrets. Gmail:
     * host=smtp.gmail.com port=587, user=<gmail>, pass=<app-password 16 char>.
     */
    let smtp_host = std::env::var("ANABASIS_SMTP_HOST").ok();
    let smtp_user = std::env::var("ANABASIS_SMTP_USERNAME").ok();
    let smtp_pass = std::env::var("ANABASIS_SMTP_PASSWORD").ok();
    let email = match (smtp_host, smtp_user, smtp_pass) {
        (Some(host), Some(username), Some(password))
            if !host.trim().is_empty()
                && !username.trim().is_empty()
                && !password.trim().is_empty() =>
        {
            let public_url = std::env::var("ANABASIS_PUBLIC_URL")
                .unwrap_or_else(|_| "https://anabasis.axonos.dev".to_string());
            Some(EmailConfig {
                host: host.trim().to_string(),
                port: std::env::var("ANABASIS_SMTP_PORT")
                    .ok()
                    .and_then(|s| s.trim().parse().ok())
                    .unwrap_or(587),
                username: username.trim().to_string(),
                password,
                // From default = ο SMTP user, αν δεν δοθεί ρητό ANABASIS_SMTP_FROM.
                from: std::env::var("ANABASIS_SMTP_FROM")
                    .ok()
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or_else(|| format!("Anabasis <{}>", username.trim())),
                public_url,
            })
        }
        _ => None,
    };

    let state = build_state(db_path, admin_email, admin_code, google_oauth, email).await?;
    let app = router(state);

    /*
     * Default 127.0.0.1: μπροστά κάθεται ΠΑΝΤΑ το cloudflared (ίδιο host) —
     * bind σε 0.0.0.0 εξέθετε το API σε LAN/tailnet ΧΩΡΙΣ το rate limiting
     * του tunnel (και με πλαστογραφήσιμο CF-Connecting-IP). Override μόνο
     * συνειδητά μέσω ANABASIS_BIND.
     */
    let bind_ip: std::net::IpAddr = std::env::var("ANABASIS_BIND")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or_else(|| std::net::IpAddr::from([127, 0, 0, 1]));
    let addr = SocketAddr::from((bind_ip, port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "anabasis-api listening");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}
