use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct ParseRequest {
    pub sample: String,
    pub match_rules: String,
    pub support_rules: Option<String>,
}

#[derive(Serialize, Default)]
pub struct ParseResponse {
    pub parsed: Option<serde_json::Value>,
    pub matched_rule: Option<String>,
    pub error: Option<String>,
}
