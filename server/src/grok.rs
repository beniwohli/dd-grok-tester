use vrl::value::Value;

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
