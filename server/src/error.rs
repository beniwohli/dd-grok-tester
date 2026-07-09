use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error(transparent)]
    Grok(#[from] crate::grok::GrokError),

    #[error("{0}")]
    PayloadTooLarge(String),

    #[error("Request timed out")]
    Timeout,

    #[error("Internal server error")]
    Internal,
}

// Tell axum how to convert `AppError` into a response.
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match &self {
            AppError::Grok(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::PayloadTooLarge(msg) => (StatusCode::PAYLOAD_TOO_LARGE, msg.clone()),
            AppError::Timeout => (StatusCode::REQUEST_TIMEOUT, self.to_string()),
            AppError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
        };

        let body = serde_json::json!({
            "error": error_message
        });

        (status, Json(body)).into_response()
    }
}
