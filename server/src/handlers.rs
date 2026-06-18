use std::time::Duration;

use axum::Json;
use tracing::info;

use crate::error::AppError;
use crate::grok::GrokEngine;
use crate::models::{BatchParseResponse, ParseRequest, ParseResponse};

const MAX_SAMPLES: usize = 100;
const MAX_SAMPLE_BYTES: usize = 64 * 1024; // 64 KB
const MAX_RULES_BYTES: usize = 64 * 1024; // 64 KB
const PARSE_TIMEOUT: Duration = Duration::from_secs(10);

pub async fn parse_grok_handler(
    Json(payload): Json<ParseRequest>,
) -> Result<Json<BatchParseResponse>, AppError> {
    // --- Input validation ---
    if payload.samples.len() > MAX_SAMPLES {
        return Err(AppError::PayloadTooLarge(format!(
            "Too many samples: {} (max {})",
            payload.samples.len(),
            MAX_SAMPLES
        )));
    }
    if payload.match_rules.len() > MAX_RULES_BYTES {
        return Err(AppError::PayloadTooLarge(format!(
            "match_rules too large: {} bytes (max {})",
            payload.match_rules.len(),
            MAX_RULES_BYTES
        )));
    }
    if let Some(ref sr) = payload.support_rules {
        if sr.len() > MAX_RULES_BYTES {
            return Err(AppError::PayloadTooLarge(format!(
                "support_rules too large: {} bytes (max {})",
                sr.len(),
                MAX_RULES_BYTES
            )));
        }
    }
    for (i, sample) in payload.samples.iter().enumerate() {
        if sample.len() > MAX_SAMPLE_BYTES {
            return Err(AppError::PayloadTooLarge(format!(
                "Sample {} too large: {} bytes (max {})",
                i,
                sample.len(),
                MAX_SAMPLE_BYTES
            )));
        }
    }

    info!("Parsing {} log samples", payload.samples.len());

    // Run CPU-bound VRL compilation + parsing on the blocking thread-pool
    // with a timeout to guard against catastrophic backtracking.
    let result = tokio::time::timeout(
        PARSE_TIMEOUT,
        tokio::task::spawn_blocking(move || -> Result<BatchParseResponse, AppError> {
            let engine = GrokEngine::new(&payload.match_rules, payload.support_rules.as_deref())?;

            let mut results = Vec::with_capacity(payload.samples.len());

            for sample in &payload.samples {
                match engine.parse(sample) {
                    Ok(Some((matched_rule, parsed))) => {
                        results.push(ParseResponse {
                            parsed: Some(parsed),
                            matched_rule: Some(matched_rule),
                        });
                    }
                    Ok(None) => {
                        results.push(ParseResponse::default());
                    }
                    Err(e) => {
                        return Err(e.into());
                    }
                }
            }

            Ok(BatchParseResponse { results })
        }),
    )
    .await;

    match result {
        Ok(Ok(Ok(response))) => Ok(Json(response)),
        Ok(Ok(Err(app_err))) => Err(app_err),
        Ok(Err(_join_err)) => Err(AppError::Timeout),
        Err(_elapsed) => Err(AppError::Timeout),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ParseRequest;

    #[tokio::test]
    async fn test_batched_requests() {
        let payload = ParseRequest {
            samples: vec![
                "john connected on 11/08/2017".to_string(),
                "jane connected on 12/09/2018".to_string(),
                "invalid sample".to_string(),
            ],
            match_rules: "MyRule %{word:user} connected on %{date(\"MM/dd/yyyy\"):date}"
                .to_string(),
            support_rules: None,
        };

        let response = parse_grok_handler(Json(payload)).await.unwrap();
        let results = response.0.results;

        assert_eq!(results.len(), 3);

        // First sample matches
        assert!(results[0].matched_rule.is_some());
        assert_eq!(results[0].matched_rule.as_deref().unwrap(), "MyRule");
        let parsed1 = results[0].parsed.as_ref().unwrap();
        assert_eq!(parsed1.get("user").unwrap().as_str().unwrap(), "john");

        // Second sample matches
        assert!(results[1].matched_rule.is_some());
        assert_eq!(results[1].matched_rule.as_deref().unwrap(), "MyRule");
        let parsed2 = results[1].parsed.as_ref().unwrap();
        assert_eq!(parsed2.get("user").unwrap().as_str().unwrap(), "jane");

        // Third sample fails to match
        assert!(results[2].matched_rule.is_none());
        assert!(results[2].parsed.is_none());
    }
}
