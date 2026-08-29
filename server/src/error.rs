//! Ενιαίο error shape: `{ "error": "<code>", "message": "<ανθρώπινο>" }` (API-CONTRACT.md §Γενικά).

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

#[derive(Debug, Serialize)]
struct ErrorBody {
    error: String,
    message: String,
}

#[derive(Debug)]
pub struct AppError {
    pub status: StatusCode,
    pub code: &'static str,
    pub message: String,
}

impl AppError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
        }
    }

    pub fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, code, message)
    }

    /// Ίδιο error ΚΑΙ για άγνωστο email ΚΑΙ για λάθος password — no user enumeration.
    pub fn bad_credentials() -> Self {
        Self::new(
            StatusCode::UNAUTHORIZED,
            "bad_credentials",
            "Λάθος email ή κωδικός.",
        )
    }

    /// Λείπει/έληξε/άκυρο bearer token.
    pub fn unauthorized() -> Self {
        Self::new(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "Μη έγκυρο ή ληγμένο token.",
        )
    }

    pub fn disabled() -> Self {
        Self::new(
            StatusCode::FORBIDDEN,
            "disabled",
            "Ο λογαριασμός είναι απενεργοποιημένος.",
        )
    }

    pub fn forbidden(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, code, message)
    }

    pub fn not_found() -> Self {
        Self::new(StatusCode::NOT_FOUND, "not_found", "Δεν βρέθηκε.")
    }

    pub fn conflict(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, code, message)
    }

    pub fn locked(message: impl Into<String>) -> Self {
        Self::new(StatusCode::LOCKED, "locked", message)
    }

    pub fn payload_too_large() -> Self {
        Self::new(
            StatusCode::PAYLOAD_TOO_LARGE,
            "payload_too_large",
            "Πάρα πολλά rows σε ένα request.",
        )
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "internal", message)
    }

    /// Το Google OAuth feature δεν έχει configured env vars σε αυτόν τον server.
    pub fn oauth_disabled() -> Self {
        Self::new(
            StatusCode::NOT_FOUND,
            "oauth_disabled",
            "Το Sign in with Google δεν είναι ενεργοποιημένο σε αυτόν τον server.",
        )
    }

    /// Το Google endpoint (token exchange/userinfo) απάντησε με σφάλμα ή μη
    /// αναμενόμενο σχήμα — δεν είναι δικό μας bug, αλλά ο caller δεν μπορεί
    /// να κάνει τίποτα εκτός από retry.
    pub fn oauth_provider_error() -> Self {
        Self::new(
            StatusCode::BAD_GATEWAY,
            "oauth_provider_error",
            "Αποτυχία επικοινωνίας με το Google. Δοκίμασε ξανά.",
        )
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let body = ErrorBody {
            error: self.code.to_string(),
            message: self.message,
        };
        (self.status, Json(body)).into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        tracing::error!(error = %e, "database error");
        AppError::internal("Σφάλμα βάσης δεδομένων.")
    }
}
