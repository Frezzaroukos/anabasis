//! SMTP connectivity check for Anabasis magic-link email.
//!
//! DRY-RUN BY DEFAULT: resolves the SMTP config from the environment (the same
//! `ANABASIS_SMTP_*` / shared `SMTP_*` names the server reads), prints a
//! redacted summary and the message it *would* send, and exits WITHOUT sending
//! and WITHOUT ever printing the password.
//!
//! It will actually send ONLY when BOTH are true:
//!   * env `ANABASIS_SMTP_TEST_SEND=1`, and
//!   * the recipient is exactly the operator's own address, given in env
//!     `ANABASIS_SMTP_TEST_OWNER` (nothing is hardcoded).
//!
//! Any other recipient is refused, so this tool can never email third parties.
//!
//! Usage (operator, with the env loaded from the secrets files):
//!   set -a; source ~/.config/aggelos-stack/secrets/email.env; set +a
//!   export ANABASIS_SMTP_TEST_OWNER=you@example.com           # your own address
//!   cargo run -p anabasis-api --example smtp_check            # dry-run
//!   ANABASIS_SMTP_TEST_SEND=1 cargo run -p anabasis-api --example smtp_check   # real send to the owner only

use anabasis_api::app::EmailConfig;
use lettre::message::Message;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Tokio1Executor};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cfg = match EmailConfig::resolve(|k| std::env::var(k).ok()) {
        Some(cfg) => cfg,
        None => {
            println!(
                "SMTP dormant: host/username/password are not all set. \
                 Source email.env (or set ANABASIS_SMTP_*) and retry."
            );
            return Ok(());
        }
    };

    // The only address this tool may mail is the operator's own, taken from the environment.
    let owner = match std::env::var("ANABASIS_SMTP_TEST_OWNER") {
        Ok(v) if !v.trim().is_empty() => v,
        _ => {
            println!(
                "Set ANABASIS_SMTP_TEST_OWNER to your own address (the only recipient \
                 this tool will mail) and retry."
            );
            return Ok(());
        }
    };
    // ANABASIS_SMTP_TEST_TO may only repeat the same value.
    let to = std::env::var("ANABASIS_SMTP_TEST_TO").unwrap_or_else(|_| owner.clone());
    let send = std::env::var("ANABASIS_SMTP_TEST_SEND").ok().as_deref() == Some("1");

    // Redacted summary — never prints the password.
    println!("SMTP config resolved:");
    println!("  host:     {}", cfg.host);
    println!("  port:     {}", cfg.port);
    println!("  username: {}", cfg.username);
    println!("  from:     {}", cfg.from);
    println!("  to:       {to}");
    println!("  password: ***** ({} chars, hidden)", cfg.password.len());

    let subject = "Anabasis SMTP check";
    let body = "This is an Anabasis SMTP connectivity test. If you received it, magic-link / recovery / deletion email is working.";
    let message = Message::builder()
        .from(cfg.from.parse()?)
        .to(to.parse()?)
        .subject(subject)
        .body(body.to_string())?;

    if !send {
        println!("\nDRY-RUN: not sending. Set ANABASIS_SMTP_TEST_SEND=1 to send for real.");
        return Ok(());
    }

    if to != owner {
        return Err(format!(
            "refusing to send: recipient {to:?} is not the owner address {owner:?}"
        )
        .into());
    }

    let creds = Credentials::new(cfg.username.clone(), cfg.password.clone());
    let mailer: AsyncSmtpTransport<Tokio1Executor> =
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&cfg.host)?
            .port(cfg.port)
            .credentials(creds)
            .build();

    println!("\nSending to {to} …");
    mailer.send(message).await?;
    println!("Sent. Check the inbox.");
    Ok(())
}
