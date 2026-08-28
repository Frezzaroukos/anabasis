use std::net::SocketAddr;
use std::path::PathBuf;

use anabasis_api::app::{build_state, default_db_path, router};

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
    let state = build_state(db_path, admin_email, admin_code).await?;
    let app = router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "anabasis-api listening");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}
