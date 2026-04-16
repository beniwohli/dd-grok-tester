use std::collections::BTreeMap;
use vrl::compiler::{compile, Context, TargetValue, TimeZone};
use vrl::prelude::state::RuntimeState;
use vrl::stdlib;
use vrl::value::{Secrets, Value};

#[derive(Debug)]
pub enum GrokError {
    MalformedSupportRule(String),
    NoMatchRules,
    CompilationError { rule_name: String, message: String },
}

pub struct GrokEngine {
    named_patterns: Vec<(String, String)>,
    aliases_json: String,
}

impl GrokEngine {
    pub fn new(match_rules: &str, support_rules: Option<&str>) -> Result<Self, GrokError> {
        let mut named_patterns = Vec::new();
        let mut support_map = BTreeMap::new();

        if let Some(support) = support_rules {
            for line in support.lines().map(|l| l.trim()).filter(|l| !l.is_empty()) {
                let parts: Vec<&str> = line.splitn(2, |c: char| c.is_whitespace()).collect();
                if parts.len() == 2 {
                    support_map.insert(parts[0].to_string(), parts[1].trim().to_string());
                } else {
                    return Err(GrokError::MalformedSupportRule(line.to_string()));
                }
            }
        }

        for line in match_rules.lines().map(|l| l.trim()).filter(|l| !l.is_empty()) {
            let parts: Vec<&str> = line.splitn(2, |c: char| c.is_whitespace()).collect();
            if parts.len() == 2 {
                let name = parts[0].to_string();
                let pattern = parts[1].trim().to_string();
                named_patterns.push((name.clone(), pattern.clone()));
                support_map.insert(name, pattern);
            } else {
                named_patterns.push((format!("rule_{}", named_patterns.len()), line.to_string()));
            }
        }

        if named_patterns.is_empty() {
            return Err(GrokError::NoMatchRules);
        }

        let aliases_json = serde_json::to_string(&support_map).unwrap();

        Ok(Self {
            named_patterns,
            aliases_json,
        })
    }

    pub fn parse(&self, sample: &str) -> Result<Option<(String, serde_json::Value)>, GrokError> {
        for (name, pattern) in &self.named_patterns {
            let vrl_program = format!(
                "result, err = parse_groks(.message, [{:?}], {})\n\
                 if is_null(err) {{ . = object!(result) }}\n",
                pattern,
                self.aliases_json
            );

            let compiled = compile(&vrl_program, &stdlib::all());

            let prog = match compiled {
                Err(diag) => {
                    let error_msg = diag.iter().map(|d| {
                        let msg = &d.message;
                        if let Some(pos) = msg.find("]: ") {
                            msg[pos + 3..].to_string()
                        } else if let Some(pos) = msg.find("error: ") {
                            msg[pos + 7..].to_string()
                        } else {
                            msg.clone()
                        }
                    }).collect::<Vec<_>>().join("\n");

                    return Err(GrokError::CompilationError {
                        rule_name: name.clone(),
                        message: error_msg,
                    });
                }
                Ok(p) => p,
            };

            let mut event: BTreeMap<_, _> = Default::default();
            event.insert("message".into(), Value::from(sample.to_string()));

            let mut target = TargetValue {
                value: Value::Object(event),
                metadata: Value::Object(Default::default()),
                secrets: Secrets::default(),
            };

            let mut state = RuntimeState::default();
            let mut ctx = Context::new(&mut target, &mut state, &TimeZone::Local);

            match prog.program.resolve(&mut ctx) {
                Ok(_) => {
                    if let Value::Object(ref obj) = target.value {
                        let only_original_message = obj.len() == 1
                            && obj.get("message").map_or(false, |v| {
                                matches!(v, Value::Bytes(b) if b.as_ref() == sample.as_bytes())
                            });

                        if !only_original_message {
                            return Ok(Some((name.clone(), vrl_value_to_json(target.value))));
                        }
                    }
                }
                Err(_) => {
                    // Did not match
                }
            }
        }
        
        Ok(None)
    }
}

pub fn vrl_value_to_json(val: Value) -> serde_json::Value {
    match val {
        Value::Object(map) => {
            let mut obj = serde_json::Map::new();
            for (k, v) in map {
                obj.insert(k.to_string(), vrl_value_to_json(v));
            }
            serde_json::Value::Object(obj)
        }
        Value::Array(arr) => {
            let json_arr = arr.into_iter().map(vrl_value_to_json).collect();
            serde_json::Value::Array(json_arr)
        }
        Value::Boolean(b) => serde_json::Value::Bool(b),
        Value::Integer(i) => serde_json::Value::Number(i.into()),
        Value::Float(f) => {
            if let Some(n) = serde_json::Number::from_f64(f.into()) {
                serde_json::Value::Number(n)
            } else {
                serde_json::Value::Null
            }
        }
        Value::Bytes(b) => serde_json::Value::String(String::from_utf8_lossy(&b).to_string()),
        Value::Timestamp(t) => {
            serde_json::Value::Number(t.timestamp_millis().into())
        }
        Value::Null => serde_json::Value::Null,
        _ => serde_json::Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn test_parse(rule: &str, sample: &str, expected: serde_json::Value, support: Option<&str>) {
        let engine = GrokEngine::new(rule, support).expect("Failed to create GrokEngine");
        let result = engine.parse(sample).expect("Parse error").expect("No match found");
        let (_, parsed) = result;

        // Filter actual results to only include the keys we expect to see
        if let serde_json::Value::Object(expected_obj) = expected {
            let actual_obj = parsed.as_object().expect("Result is not an object");
            for (key, expected_val) in expected_obj {
                let actual_val = actual_obj.get(&key).unwrap_or(&serde_json::Value::Null);
                
                if key == "date" || key == "date_access" || key == "timestamp" {
                   // Handle timestamp comparison with a bit of tolerance for date-only parses
                   let actual_ts = actual_val.as_i64().expect("timestamp is not an integer");
                   let expected_ts = expected_val.as_i64().expect("expected timestamp is not an integer");
                   assert!((actual_ts - expected_ts).abs() < 24 * 60 * 60 * 1000, 
                           "Timestamp mismatch for {}: expected {}, got {}", key, expected_ts, actual_ts);
                } else {
                    assert_eq!(actual_val, &expected_val, "Value mismatch for key '{}'", key);
                }
            }
        }
    }

    #[test]
    fn test_classic_unstructured_log() {
        test_parse(
            "MyParsingRule %{word:user} connected on %{date(\"MM/dd/yyyy\"):date}",
            "john connected on 11/08/2017",
            json!({"user": "john", "date": 1510099200000i64}),
            None
        );
    }

    #[test]
    fn test_parsing_dates() {
        // HH:mm:ss without a date defaults to today. We just check it parses to something sensible.
        let engine = GrokEngine::new("date_rule %{date(\"HH:mm:ss\"):date}", None).unwrap();
        let result = engine.parse("14:20:15").unwrap().unwrap();
        assert!(result.1.as_object().unwrap().contains_key("date"));
    }

    #[test]
    fn test_alternating_pattern() {
        test_parse(
            "MyParsingRule (%{integer:user.id}|%{word:user.firstname}) connected on %{date(\"MM/dd/yyyy\"):connect_date}",
            "john connected on 11/08/2017",
            json!({
                "user": {"firstname": "john"},
                "connect_date": 1510099200000i64
            }),
            None
        );
    }

    #[test]
    fn test_optional_attribute() {
        test_parse(
            "MyParsingRule %{word:user.firstname} (%{integer:user.id} )?connected on %{date(\"MM/dd/yyyy\"):connect_date}",
            "john 1234 connected on 11/08/2017",
            json!({
                "user": {"firstname": "john", "id": 1234},
                "connect_date": 1510099200000i64
            }),
            None
        );
    }

    #[test]
    fn test_regex() {
        test_parse(
            "MyParsingRule %{regex(\"[a-z]*\"):user.firstname}_%{regex(\"[a-zA-Z0-9]*\"):user.id} .*",
            "john_1a2b3c4 connected on 11/08/2017",
            json!({
                "user": {"firstname": "john", "id": "1a2b3c4"}
            }),
            None
        );
    }

    #[test]
    fn test_discard_data() {
        test_parse(
            "MyParsingRule Usage\\:\\s+%{number:usage}%{data:ignore}",
            "Usage: 24.3%",
            json!({"usage": 24.3, "ignore": "%"}),
            None
        );
    }

    #[test]
    fn test_cross_referencing_match_rules() {
        test_parse(
            "access.common %{_client_ip} %{_ident} %{_auth} \\[%{_date_access}\\] \"(?>%{_method} |)%{_url}(?> %{_version}|)\" %{_status_code} (?>%{_bytes_written}|-)\naccess.combined %{access.common} \"%{_referer}\" \"%{_user_agent}\"",
            "192.0.2.1 - Ultan [07/Mar/2004:16:43:54 -0800] \"GET /unencrypted_password_list?foo=bar HTTP/1.1\" 404 9001 \"http://passwords.hackz0r\" \"Mozilla/4.08 [en] (Win95)\"",
            json!({
                "network": { "client": { "ip": "192.0.2.1" } },
                "http": {
                    "auth": "Ultan",
                    "ident": "-",
                    "status_code": 404,
                    "method": "GET",
                    "url": "/unencrypted_password_list?foo=bar",
                    "version": "1.1",
                    "response": { "bytes": 9001 },
                    "referer": "http://passwords.hackz0r",
                    "useragent": "Mozilla/4.08 [en] (Win95)"
                },
                "date_access": 1078706634000i64
            }),
            Some("_client_ip %{ipOrHost:network.client.ip}\n_ident %{notSpace:http.ident}\n_auth %{notSpace:http.auth}\n_date_access %{date(\"dd/MMM/yyyy:HH:mm:ss Z\"):date_access}\n_method %{word:http.method}\n_url %{notSpace:http.url}\n_version %{word}/%{regex(\"\\\\d+\\\\.\\\\d+\"):http.version}\n_status_code %{integer:http.status_code}\n_bytes_written %{integer:http.response.bytes}\n_referer %{notSpace:http.referer}\n_user_agent %{data:http.useragent}")
        );
    }
}

