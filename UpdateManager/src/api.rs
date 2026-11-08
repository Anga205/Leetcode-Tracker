use anyhow::{anyhow, bail, Context, Result};
use reqwest::{blocking::Client, StatusCode};
use serde_json::Value;

pub struct ApiClient {
    base_url: String,
    client: Client,
}

impl ApiClient {
    pub fn new(
        base_url: &str,
        connect_timeout: std::time::Duration,
        timeout: std::time::Duration,
    ) -> Result<Self> {
        let client = Client::builder()
            .connect_timeout(connect_timeout)
            .timeout(timeout)
            .build()
            .context("build HTTP client")?;
        Ok(Self {
            base_url: format!("{}/", base_url.trim_end_matches('/')),
            client,
        })
    }

    pub fn fetch_total_solved(&self, username: &str) -> Result<i64> {
        let url = format!("{}{}", self.base_url, username);
        let response = self
            .client
            .get(&url)
            .send()
            .with_context(|| format!("fetch user JSON for {username:?}"))?;
        let status = response.status();
        if status != StatusCode::OK {
            let body = response.text().unwrap_or_default();
            let snippet = if body.chars().count() > 500 {
                format!("{}...", body.chars().take(500).collect::<String>())
            } else {
                body
            };
            if snippet.is_empty() {
                bail!("HTTP {} fetching {}", status.as_u16(), url);
            }
            bail!(
                "HTTP {} fetching {}: response body: {}",
                status.as_u16(),
                url,
                snippet
            );
        }
        let payload: Value = response.json().context("parse API JSON")?;
        let value = find_total_solved(&payload).ok_or_else(|| anyhow!("totalSolved is missing"))?;
        value.as_i64().ok_or_else(|| anyhow!("invalid totalSolved"))
    }
}

pub fn find_total_solved(value: &Value) -> Option<&Value> {
    match value {
        Value::Object(object) => {
            if let Some(candidate) = object.get("totalSolved") {
                return Some(candidate);
            }
            object.values().find_map(find_total_solved)
        }
        Value::Array(array) => array.iter().find_map(find_total_solved),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_nested_and_array_values() {
        let value: Value =
            serde_json::from_str(r#"{"data":[{"stats":{"totalSolved":456}}]}"#).unwrap();
        assert_eq!(find_total_solved(&value).and_then(Value::as_i64), Some(456));
    }

    #[test]
    fn ignores_missing_and_non_integer_values() {
        let missing: Value = serde_json::from_str(r#"{}"#).unwrap();
        assert!(find_total_solved(&missing).is_none());
        let non_integer: Value = serde_json::from_str(r#"{"totalSolved":"123"}"#).unwrap();
        assert!(find_total_solved(&non_integer)
            .and_then(Value::as_i64)
            .is_none());
    }
}
