use crate::{api::ApiClient, config, readings};
use anyhow::{anyhow, Context, Result};
use std::time::Duration;

pub struct Updater {
    pub api: ApiClient,
    pub attempts: usize,
    pub retry_delay: Duration,
    pub between_user_delay: Duration,
    pub now: Box<dyn Fn() -> f64 + Send + Sync>,
    pub sleep: Box<dyn Fn(Duration) + Send + Sync>,
}

pub fn default_updater() -> Updater {
    Updater {
        api: ApiClient::new(
            config::API_BASE_URL,
            config::CONNECT_TIMEOUT,
            config::READ_TIMEOUT,
        )
        .expect("valid updater HTTP configuration"),
        attempts: config::MAX_ATTEMPTS,
        retry_delay: config::RETRY_DELAY,
        between_user_delay: config::BETWEEN_USER_DELAY,
        now: Box::new(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock is before Unix epoch")
                .as_secs_f64()
        }),
        sleep: Box::new(std::thread::sleep),
    }
}

impl Updater {
    pub fn update(&self, path: impl AsRef<std::path::Path>, users: &[&str]) -> Result<()> {
        if self.attempts == 0 {
            return Err(anyhow!("updater attempts must be at least 1"));
        }
        let mut readings = readings::load(&path)?;
        readings.ensure_keys(users);
        for (index, username) in users.iter().enumerate() {
            let solved = self.fetch_with_retries(username)?;
            let entry = readings
                .entry(&username.to_lowercase())
                .expect("ensure_keys added every tracked user");
            if entry
                .readings
                .last()
                .is_none_or(|reading| solved > reading.solved_count)
            {
                entry.readings.push(crate::model::Reading {
                    solved_count: solved,
                    timestamp_seconds: (self.now)(),
                });
            }
            if index + 1 < users.len() {
                (self.sleep)(self.between_user_delay);
            }
        }
        readings::save(path, &readings).context("save updated readings")
    }

    fn fetch_with_retries(&self, username: &str) -> Result<i64> {
        let mut last_error = None;
        for attempt in 1..=self.attempts {
            match self.api.fetch_total_solved(username) {
                Ok(solved) => return Ok(solved),
                Err(error) => {
                    last_error = Some(error);
                    if attempt < self.attempts {
                        (self.sleep)(self.retry_delay);
                    }
                }
            }
        }
        Err(last_error.expect("at least one attempt"))
            .with_context(|| format!("updating {username} after {} attempts", self.attempts))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tiny_http::{Response, Server};

    fn test_updater(server_url: &str, sleeps: Arc<Mutex<Vec<Duration>>>) -> Updater {
        Updater {
            api: ApiClient::new(server_url, Duration::from_secs(1), Duration::from_secs(1))
                .unwrap(),
            attempts: 1,
            retry_delay: Duration::ZERO,
            between_user_delay: Duration::from_secs(5),
            now: Box::new(|| 20.5),
            sleep: Box::new(move |delay| sleeps.lock().unwrap().push(delay)),
        }
    }

    #[test]
    fn rejects_zero_attempts_before_loading_history() {
        let mut updater = default_updater();
        updater.attempts = 0;
        let directory = tempfile::tempdir().unwrap();
        let error = updater
            .update(directory.path().join("readings.json"), &[])
            .unwrap_err();
        assert!(error.to_string().contains("at least 1"));
    }

    #[test]
    fn appends_only_when_the_count_increases() {
        let server = Server::http("0.0.0.0:0").unwrap();
        let server_url = format!("http://{}", server.server_addr());
        let thread = std::thread::spawn(move || {
            for _ in 0..2 {
                let request = server.recv().unwrap();
                request
                    .respond(Response::from_string(r#"{"totalSolved":3}"#))
                    .unwrap();
            }
        });
        let sleeps = Arc::new(Mutex::new(Vec::new()));
        let updater = test_updater(&server_url, Arc::clone(&sleeps));
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("readings.json");
        updater.update(&path, &["First"]).unwrap();
        updater.update(&path, &["First"]).unwrap();
        thread.join().unwrap();
        let readings = readings::load(&path).unwrap();
        assert_eq!(readings.entries[0].readings.len(), 1);
        assert!(sleeps.lock().unwrap().is_empty());
    }
}
