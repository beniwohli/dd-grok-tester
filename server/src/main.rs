use axum::{
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;
use vrl::compiler::{compile, Context, TargetValue, TimeZone};
use vrl::prelude::state::RuntimeState;
use vrl::value::{Value, Secrets};
use vrl::stdlib;
use std::net::SocketAddr;
use regex::Regex;
use tracing::{info, Level};
use tracing_subscriber;

#[derive(Deserialize)]
struct ParseRequest {
    sample: String,
    match_rules: String,
    support_rules: Option<String>,
}

#[derive(Serialize)]
struct ParseResponse {
    parsed: Option<serde_json::Value>,
    matched_rule: Option<String>,
    error: Option<String>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_max_level(Level::INFO)
        .init();

    info!("Starting Datadog Grok Tester server...");

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api_router = Router::new()
        .route("/parse", post(parse_grok_handler));

    let app = Router::new()
        .nest("/api", api_router)
        .fallback_service(ServeDir::new("./dist"))
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "3001".to_string())
        .parse::<u16>()
        .expect("PORT must be a number");
    
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Server listening on http://{}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    info!("Axum server starting...");
    
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            info!("SIGINT received, shutting down gracefully");
        },
        _ = terminate => {
            info!("SIGTERM received, shutting down gracefully");
        },
    }
}

async fn parse_grok_handler(Json(payload): Json<ParseRequest>) -> Json<ParseResponse> {
    info!("Request received: Parsing log sample (length: {})", payload.sample.len());
    
    let mut named_patterns = Vec::new();
    for line in payload.match_rules.lines().map(|l| l.trim()).filter(|l| !l.is_empty()) {
        // Split by the first whitespace. If no whitespace, it's just a pattern with no name.
        let parts: Vec<&str> = line.splitn(2, |c: char| c.is_whitespace()).collect();
        if parts.len() == 2 {
            named_patterns.push((parts[0].to_string(), parts[1].trim().to_string()));
        } else {
            named_patterns.push((format!("rule_{}", named_patterns.len()), line.to_string()));
        }
    }

    if named_patterns.is_empty() {
        return Json(ParseResponse {
            parsed: None,
            matched_rule: None,
            error: Some("No match rules provided".to_string()),
        });
    }

    let mut support_map = BTreeMap::new();
    if let Some(support) = payload.support_rules {
        for line in support.lines().map(|l| l.trim()).filter(|l| !l.is_empty()) {
            let parts: Vec<&str> = line.splitn(2, |c: char| c.is_whitespace()).collect();
            if parts.len() == 2 {
                support_map.insert(parts[0].to_string(), parts[1].trim().to_string());
            }
        }
    }

    let grok_regex = Regex::new(r"%\{(?P<name>[\w\._-]+)(?::(?P<field>[\w\._-]+))?\}").unwrap();
    let mut expanded_patterns = Vec::new();

    for (name, pattern) in named_patterns {
        let mut current = pattern;
        let mut depth = 0;
        
        loop {
            let mut changed = false;
            let mut next = String::new();
            let mut last_end = 0;

            for cap in grok_regex.captures_iter(&current) {
                let full = cap.get(0).unwrap();
                let gname = cap.name("name").unwrap().as_str();
                let gfield = cap.name("field").map(|f| f.as_str());

                next.push_str(&current[last_end..full.start()]);

                if let Some(body) = support_map.get(gname) {
                    if let Some(f) = gfield {
                        next.push_str(&format!("(?<{}>{})", f, body));
                    } else {
                        next.push_str(&format!("(?:{})", body));
                    }
                    changed = true;
                } else {
                    next.push_str(full.as_str());
                }
                last_end = full.end();
            }
            next.push_str(&current[last_end..]);
            current = next;
            depth += 1;
            if !changed || depth > 10 { break; }
        }
        expanded_patterns.push((name, current));
    }

    for (name, pattern) in expanded_patterns {
        // Wrap the pattern in [ ] because parse_groks! expects an array
        let vrl_program = format!(". = parse_groks!(.message, [{:?}])\n", pattern);
        let res = compile(&vrl_program, &stdlib::all());

        if let Ok(prog) = res {
            let mut event = BTreeMap::new();
            event.insert("message".into(), Value::from(payload.sample.clone()));
            
            let mut value = Value::Object(event.clone());
            let mut target = TargetValue {
                value: value.clone(),
                metadata: Value::Object(BTreeMap::new()),
                secrets: Secrets::default(),
            };
            
            let mut state = RuntimeState::default();
            let mut ctx = Context::new(&mut target, &mut state, &TimeZone::Local);

            if prog.program.resolve(&mut ctx).is_ok() {
                if let Value::Object(ref obj) = target.value {
                    // Check if we extracted anything other than the original message
                    if obj.len() > 1 || !obj.contains_key("message") {
                        info!("Match found: rule '{}'", name);
                        return Json(ParseResponse {
                            parsed: Some(vrl_value_to_json(target.value)),
                            matched_rule: Some(name),
                            error: None,
                        });
                    }
                }
            }
        } else if let Err(diag) = res {
             info!("Compilation failed for rule '{}': {:?}", name, diag);
        }
    }

    info!("No match found for log sample");
    Json(ParseResponse {
        parsed: None,
        matched_rule: None,
        error: None,
    })
}

fn vrl_value_to_json(val: Value) -> serde_json::Value {
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
        },
        Value::Null => serde_json::Value::Null,
        _ => serde_json::Value::Null,
    }
}
