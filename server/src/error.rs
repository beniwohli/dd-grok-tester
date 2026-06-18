use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Malformed support rule (expected \"NAME PATTERN\"): {0}")]
    MalformedSupportRule(String),

    #[error("No match rules provided")]
    NoMatchRules,

    #[error("Rule '{rule_name}': {message}")]
    CompilationError { rule_name: String, message: String },

    #[error("{0}")]
    PayloadTooLarge(String),

    #[error("Request timed out")]
    Timeout,
}

// Convert from GrokError into AppError
impl From<crate::grok::GrokError> for AppError {
    fn from(err: crate::grok::GrokError) -> Self {
        match err {
            crate::grok::GrokError::MalformedSupportRule(s) => AppError::MalformedSupportRule(s),
            crate::grok::GrokError::NoMatchRules => AppError::NoMatchRules,
            crate::grok::GrokError::CompilationError { rule_name, message } => {
                AppError::CompilationError { rule_name, message }
            }
        }
    }
}

// Tell axum how to convert `AppError` into a response.
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match &self {
            AppError::MalformedSupportRule(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::NoMatchRules => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::CompilationError { rule_name, message } => (
                StatusCode::BAD_REQUEST,
                format!("Rule '{}': {}", rule_name, message),
            ),
            AppError::PayloadTooLarge(msg) => (StatusCode::PAYLOAD_TOO_LARGE, msg.clone()),
            AppError::Timeout => (StatusCode::REQUEST_TIMEOUT, self.to_string()),
        };

        let body = serde_json::json!({
            "error": error_message
        });

        (status, Json(body)).into_response()
    }
}
