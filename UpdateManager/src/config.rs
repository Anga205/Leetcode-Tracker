use std::time::Duration;

pub const API_BASE_URL: &str = "https://leetcode-api-faisalshohag.anga.codes";
pub const READINGS_PATH: &str = "ProgressViewer/public/readings.json";
pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
pub const READ_TIMEOUT: Duration = Duration::from_secs(20);
pub const RETRY_DELAY: Duration = Duration::from_secs(30);
pub const BETWEEN_USER_DELAY: Duration = Duration::from_secs(5);
pub const MAX_ATTEMPTS: usize = 4;
pub const TRACKED_USERS: &[&str] = &[
    "Anga205",
    "munish42",
    "shakirth-anisha",
    "prayasha_nanda",
    "sashshaikh12",
    "siri_n_shetty",
];
