use crate::model::ReadingsFile;
use anyhow::{Context, Result};
use std::fs;
use std::io::Write;
use std::path::Path;

pub fn load(path: impl AsRef<Path>) -> Result<ReadingsFile> {
    let path = path.as_ref();
    match fs::read_to_string(path) {
        Ok(contents) => {
            let value = serde_json::from_str(&contents).context("parse readings file")?;
            ReadingsFile::from_value(value)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(ReadingsFile::default()),
        Err(error) => Err(error).with_context(|| format!("read readings file {}", path.display())),
    }
}

pub fn save(path: impl AsRef<Path>, readings: &ReadingsFile) -> Result<()> {
    let path = path.as_ref();
    let contents =
        serde_json::to_string_pretty(&readings.to_value()).context("serialize readings")? + "\n";
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)
        .with_context(|| format!("create readings directory {}", parent.display()))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("readings.json");
    let mut temporary = tempfile::Builder::new()
        .prefix(&format!(".{file_name}."))
        .suffix(".tmp")
        .tempfile_in(parent)
        .with_context(|| format!("create temporary readings file in {}", parent.display()))?;
    temporary
        .write_all(contents.as_bytes())
        .with_context(|| "write temporary readings file")?;
    temporary
        .persist(path)
        .map_err(|error| error.error)
        .with_context(|| format!("replace readings file {}", path.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Reading, ReadingEntry};

    #[test]
    fn missing_file_is_initialized_and_saved() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("nested/readings.json");
        let readings = ReadingsFile {
            entries: vec![ReadingEntry {
                key: "user".into(),
                readings: vec![Reading {
                    solved_count: 3,
                    timestamp_seconds: 20.5,
                }],
            }],
        };
        assert!(load(&path).unwrap().entries.is_empty());
        save(&path, &readings).unwrap();
        assert_eq!(load(&path).unwrap(), readings);
    }

    #[test]
    fn malformed_history_is_rejected_without_replacement() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("readings.json");
        fs::write(&path, "not json").unwrap();
        assert!(load(&path).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "not json");
    }
}
