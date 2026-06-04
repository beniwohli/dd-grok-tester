use axum::Json;
use tracing::info;

use crate::models::{ParseRequest, ParseResponse, BatchParseResponse};
use crate::grok::GrokEngine;
use crate::error::AppError;

pub async fn parse_grok_handler(
    Json(payload): Json<ParseRequest>,
) -> Result<Json<BatchParseResponse>, AppError> {
    info!("Parsing {} log samples", payload.samples.len());

    let engine = GrokEngine::new(&payload.match_rules, payload.support_rules.as_deref())?;

    let mut results = Vec::with_capacity(payload.samples.len());

    for sample in payload.samples {
        match engine.parse(&sample) {
            Ok(Some((matched_rule, parsed))) => {
                results.push(ParseResponse {
                    parsed: Some(parsed),
                    matched_rule: Some(matched_rule),
                });
            }
            Ok(None) => {
                results.push(ParseResponse {
                    ..Default::default()
                });
            }
            Err(e) => {
                return Err(e.into());
            }
        }
    }

    Ok(Json(BatchParseResponse { results }))
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
            match_rules: "MyRule %{word:user} connected on %{date(\"MM/dd/yyyy\"):date}".to_string(),
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
