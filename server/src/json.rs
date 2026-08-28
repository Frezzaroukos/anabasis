//! `Json<T>` extractor wrapper ώστε ΚΑΙ τα rejections (κατεστραμμένο/λάθος JSON
//! σώμα) να ακολουθούν το ενιαίο error shape `{ error, message }` του συμβολαίου.

use axum::extract::{FromRequest, Request};
use axum::http::StatusCode;
use axum::Json;
use serde::de::DeserializeOwned;

use crate::app::AppState;
use crate::error::AppError;

pub struct AppJson<T>(pub T);

impl<T> FromRequest<AppState> for AppJson<T>
where
    T: DeserializeOwned,
{
    type Rejection = AppError;

    async fn from_request(req: Request, state: &AppState) -> Result<Self, Self::Rejection> {
        let Json(value) = Json::<T>::from_request(req, state)
            .await
            .map_err(|rejection| {
                AppError::new(
                    StatusCode::BAD_REQUEST,
                    "invalid_json",
                    rejection.to_string(),
                )
            })?;
        Ok(AppJson(value))
    }
}
