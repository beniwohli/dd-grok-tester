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
