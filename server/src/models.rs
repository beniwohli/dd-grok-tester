use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct ParseRequest {
    pub samples: Vec<String>,
    pub match_rules: String,
    pub support_rules: Option<String>,
}

#[derive(Serialize, Default)]
pub struct ParseResponse {
    pub parsed: Option<serde_json::Value>,
    pub matched_rule: Option<String>,
}

#[derive(Serialize)]
pub struct BatchParseResponse {
    pub results: Vec<ParseResponse>,
}
