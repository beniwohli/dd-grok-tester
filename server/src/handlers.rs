use axum::Json;
use tracing::info;

use crate::models::{ParseRequest, ParseResponse};
use crate::grok::{GrokEngine, GrokError};

pub async fn parse_grok_handler(Json(payload): Json<ParseRequest>) -> Json<ParseResponse> {
    info!("Request received: Parsing log sample (length: {})", payload.sample.len());

    let engine = match GrokEngine::new(&payload.match_rules, payload.support_rules.as_deref()) {
        Ok(e) => e,
        Err(GrokError::MalformedSupportRule(line)) => {
            return Json(ParseResponse {
                error: Some(format!("Malformed support rule (expected \"NAME PATTERN\"): {:?}", line)),
                ..Default::default()
            });
        }
        Err(GrokError::NoMatchRules) => {
            return Json(ParseResponse {
                error: Some("No match rules provided".to_string()),
                ..Default::default()
            });
        }
        Err(GrokError::CompilationError { rule_name, message }) => {
            return Json(ParseResponse {
                error: Some(format!("Rule '{}': {}", rule_name, message)),
                ..Default::default()
            });
        }
    };

    match engine.parse(&payload.sample) {
        Ok(Some((matched_rule, parsed))) => {
            info!("Match found: rule '{}'", matched_rule);
            Json(ParseResponse {
                parsed: Some(parsed),
                matched_rule: Some(matched_rule),
                error: None,
            })
        }
        Ok(None) => {
            info!("No match found for log sample");
            Json(ParseResponse {
                ..Default::default()
            })
        }
        Err(GrokError::CompilationError { rule_name, message }) => {
            Json(ParseResponse {
                error: Some(format!("Rule '{}': {}", rule_name, message)),
                ..Default::default()
            })
        }
        Err(_) => {
            // Fallback for any other GrokError
            Json(ParseResponse {
                error: Some("Internal grok parsing error".to_string()),
                ..Default::default()
            })
        }
    }
}
