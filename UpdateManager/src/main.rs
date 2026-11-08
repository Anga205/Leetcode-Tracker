use anyhow::Result;
use update_manager::{config, updater};

fn main() -> Result<()> {
    updater::default_updater().update(config::READINGS_PATH, config::TRACKED_USERS)
}
