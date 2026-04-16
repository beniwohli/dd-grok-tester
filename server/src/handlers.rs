use axum::Json;
use tracing::info;

use crate::models::{ParseRequest, ParseResponse};
use crate::grok::{GrokEngine, GrokError};
use crate::error::AppError;

pub async fn parse_grok_handler(Json(payload): Json<ParseRequest>) -> Result<Json<ParseResponse>, AppError> {
    info!("Request received: Parsing log sample (length: {})", payload.sample.len());

    let engine = GrokEngine::new(&payload.match_rules, payload.support_rules.as_deref())?;

    match engine.parse(&payload.sample) {
        Ok(Some((matched_rule, parsed))) => {
            info!("Match found: rule '{}'", matched_rule);
            Ok(Json(ParseResponse {
                parsed: Some(parsed),
                matched_rule: Some(matched_rule),
            }))
        }
        Ok(None) => {
            info!("No match found for log sample");
            Ok(Json(ParseResponse {
                ..Default::default()
            }))
        }
        Err(e) => {
            Err(e.into())
        }
    }
}
