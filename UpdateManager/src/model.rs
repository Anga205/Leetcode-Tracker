use anyhow::{anyhow, Result};
use serde_json::{Map, Value};

#[derive(Clone, Debug, PartialEq)]
pub struct Reading {
    pub solved_count: i64,
    pub timestamp_seconds: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ReadingEntry {
    pub key: String,
    pub readings: Vec<Reading>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ReadingsFile {
    pub entries: Vec<ReadingEntry>,
}

impl ReadingsFile {
    pub fn ensure_keys(&mut self, users: &[&str]) {
        for username in users {
            let key = username.to_lowercase();
            if self.entry(&key).is_none() {
                self.entries.push(ReadingEntry {
                    key,
                    readings: Vec::new(),
                });
            }
        }
    }

    pub fn entry(&mut self, key: &str) -> Option<&mut ReadingEntry> {
        self.entries.iter_mut().find(|entry| entry.key == key)
    }

    pub fn from_value(value: Value) -> Result<Self> {
        let object = value
            .as_object()
            .ok_or_else(|| anyhow!("readings root must be an object"))?;
        let mut entries = Vec::with_capacity(object.len());
        for (key, readings) in object {
            let values = readings
                .as_array()
                .ok_or_else(|| anyhow!("readings for {key} must be an array"))?;
            let mut parsed = Vec::with_capacity(values.len());
            for pair in values {
                let pair = pair
                    .as_array()
                    .filter(|pair| pair.len() == 2)
                    .ok_or_else(|| anyhow!("invalid reading pair for {key}"))?;
                let solved_count = pair[0]
                    .as_i64()
                    .ok_or_else(|| anyhow!("invalid solved count for {key}"))?;
                let timestamp_seconds = pair[1]
                    .as_f64()
                    .ok_or_else(|| anyhow!("invalid timestamp for {key}"))?;
                parsed.push(Reading {
                    solved_count,
                    timestamp_seconds,
                });
            }
            entries.push(ReadingEntry {
                key: key.clone(),
                readings: parsed,
            });
        }
        Ok(Self { entries })
    }

    pub fn to_value(&self) -> Value {
        let mut object = Map::with_capacity(self.entries.len());
        for entry in &self.entries {
            let readings = entry
                .readings
                .iter()
                .map(|reading| {
                    Value::Array(vec![
                        Value::from(reading.solved_count),
                        Value::from(reading.timestamp_seconds),
                    ])
                })
                .collect();
            object.insert(entry.key.clone(), Value::Array(readings));
        }
        Value::Object(object)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_object_order_and_adds_missing_users() {
        let value: Value = serde_json::from_str(r#"{"z":[[2,3]],"a":[]}"#).unwrap();
        let mut readings = ReadingsFile::from_value(value).unwrap();
        readings.ensure_keys(&["A", "new_user"]);
        let keys: Vec<_> = readings
            .entries
            .iter()
            .map(|entry| entry.key.as_str())
            .collect();
        assert_eq!(keys, ["z", "a", "new_user"]);
    }

    #[test]
    fn rejects_malformed_reading_pairs() {
        let value: Value = serde_json::from_str(r#"{"a":[[1]]}"#).unwrap();
        assert!(ReadingsFile::from_value(value).is_err());
    }
}
