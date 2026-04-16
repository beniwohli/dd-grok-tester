use axum::Json;
use std::collections::BTreeMap;
use tracing::{debug, info};
use vrl::compiler::{compile, Context, TargetValue, TimeZone};
use vrl::prelude::state::RuntimeState;
use vrl::stdlib;
use vrl::value::{Secrets, Value};

use crate::models::{ParseRequest, ParseResponse};
use crate::grok::vrl_value_to_json;

pub async fn parse_grok_handler(Json(payload): Json<ParseRequest>) -> Json<ParseResponse> {
    info!("Request received: Parsing log sample (length: {})", payload.sample.len());

    let mut named_patterns = Vec::new();
    let mut support_map = BTreeMap::new();

    // 1. Parse explicit support rules into the alias map.
    if let Some(support) = payload.support_rules {
        for line in support.lines().map(|l| l.trim()).filter(|l| !l.is_empty()) {
            let parts: Vec<&str> = line.splitn(2, |c: char| c.is_whitespace()).collect();
            if parts.len() == 2 {
                support_map.insert(parts[0].to_string(), parts[1].trim().to_string());
            } else {
                return Json(ParseResponse {
                    error: Some(format!(
                        "Malformed support rule (expected \"NAME PATTERN\"): {:?}",
                        line
                    )),
                    ..Default::default()
                });
            }
        }
    }

    // 2. Parse match rules: "NAME PATTERN"
    // We add these to the support_map as well so they can be referenced by other rules.
    for line in payload.match_rules.lines().map(|l| l.trim()).filter(|l| !l.is_empty()) {
        let parts: Vec<&str> = line.splitn(2, |c: char| c.is_whitespace()).collect();
        if parts.len() == 2 {
            let name = parts[0].to_string();
            let pattern = parts[1].trim().to_string();
            named_patterns.push((name.clone(), pattern.clone()));
            // Allow match rules to be used as aliases in other match rules
            support_map.insert(name, pattern);
        } else {
            named_patterns.push((format!("rule_{}", named_patterns.len()), line.to_string()));
        }
    }

    if named_patterns.is_empty() {
        return Json(ParseResponse {
            error: Some("No match rules provided".to_string()),
            ..Default::default()
        });
    }

    let aliases_json = serde_json::to_string(&support_map).unwrap();

    // 3. Test each pattern using parse_groks (fallible variant) with aliases.
    //
    // Using the fallible `parse_groks(...)` rather than `parse_groks!(...)` is
    // intentional: the infallible variant aborts the VRL program on a no-match,
    // giving us no opportunity to try the next rule. The fallible variant
    // returns an Err value that lets the program continue and lets us detect
    // "no match" vs a genuine runtime error.
    for (name, pattern) in named_patterns {
        let vrl_program = format!(
            "result, err = parse_groks(.message, [{:?}], {})\n\
             if is_null(err) {{ . = object!(result) }}\n",
            pattern,
            aliases_json
        );

        let compiled = compile(&vrl_program, &stdlib::all());

        let prog = match compiled {
            Err(diag) => {
                let error_msg = diag.iter().map(|d| {
                    let msg = &d.message;
                    // VRL grok errors are often very verbose. Try to extract the meaningful part.
                    if let Some(pos) = msg.find("]: ") {
                        msg[pos + 3..].to_string()
                    } else if let Some(pos) = msg.find("error: ") {
                        msg[pos + 7..].to_string()
                    } else {
                        msg.clone()
                    }
                }).collect::<Vec<_>>().join("\n");

                return Json(ParseResponse {
                    parsed: None,
                    matched_rule: None,
                    error: Some(format!("Rule '{}': {}", name, error_msg)),
                });
            }
            Ok(p) => p,
        };

        let mut event: BTreeMap<_, _> = Default::default();
        event.insert("message".into(), Value::from(payload.sample.clone()));

        let mut target = TargetValue {
            value: Value::Object(event),
            metadata: Value::Object(Default::default()),
            secrets: Secrets::default(),
        };

        let mut state = RuntimeState::default();
        let mut ctx = Context::new(&mut target, &mut state, &TimeZone::Local);

        match prog.program.resolve(&mut ctx) {
            Ok(_) => {
                // A successful parse replaces the root object via `object!(result)`.
                // If the result is still just `{message: ...}` unchanged, the
                // pattern matched nothing useful — skip to the next rule.
                if let Value::Object(ref obj) = target.value {
                    let only_original_message = obj.len() == 1
                        && obj.get("message").map_or(false, |v| {
                            matches!(v, Value::Bytes(b) if b.as_ref() == payload.sample.as_bytes())
                        });

                    if !only_original_message {
                        info!("Match found: rule '{}'", name);
                        return Json(ParseResponse {
                            parsed: Some(vrl_value_to_json(target.value)),
                            matched_rule: Some(name),
                            error: None,
                        });
                    }
                }
                debug!("Rule '{}' produced no parsed fields, trying next", name);
            }
            Err(e) => {
                debug!("Rule '{}' did not match: {}", name, e);
            }
        }
    }

    info!("No match found for log sample");
    Json(ParseResponse {
        ..Default::default()
    })
}
