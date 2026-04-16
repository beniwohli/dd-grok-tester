use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Malformed support rule (expected \"NAME PATTERN\"): {0}")]
    MalformedSupportRule(String),
    
    #[error("No match rules provided")]
    NoMatchRules,
    
    #[error("Rule '{rule_name}': {message}")]
    CompilationError {
        rule_name: String,
        message: String,
    },
    
    #[error("Internal grok parsing error")]
    InternalError,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::MalformedSupportRule(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::NoMatchRules => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::CompilationError { .. } => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::InternalError => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
        };

        let body = Json(json!({
            "error": error_message,
        }));

        (status, body).into_response()
    }
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
