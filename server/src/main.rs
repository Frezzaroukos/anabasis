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
     * Magic-link email login — δορμάν μέχρι να οριστούν host/user/pass. Δέχεται
     * ΚΑΙ τα ANABASIS_SMTP_* ΚΑΙ τα generic SMTP_* (axonos email.env), ώστε ένα
     * EnvironmentFile= να αρκεί χωρίς αντιγραφή secrets εδώ (βλ. EmailConfig::
     * resolve). Gmail: host=smtp.gmail.com port=587, pass=<app-password 16 char>.
     */
    let email = EmailConfig::resolve(|k| std::env::var(k).ok());

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

    let mut state = build_state(db_path, admin_email, admin_code, google_oauth, email).await?;
    state.trust_cf_ip = std::env::var("ANABASIS_TRUST_CF_IP")
        .ok()
        .and_then(|v| match v.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" => Some(true),
            "0" | "false" | "no" => Some(false),
            _ => None,
        })
        .unwrap_or_else(|| bind_ip.is_loopback());
    if !bind_ip.is_loopback() && state.trust_cf_ip {
        tracing::warn!(
            %bind_ip,
            "ANABASIS_TRUST_CF_IP is enabled on a non-loopback bind; only do this behind a trusted proxy"
        );
    }
    let app = router(state);

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
