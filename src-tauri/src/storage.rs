//! Persistent storage for `AppData`.
//!
//! Layout under `app_data_dir()`:
//! ```text
//!   data.json       — current state, pretty-printed JSON
//!   data.json.bak   — last good copy (rotated on each successful save)
//!   data.json.tmp   — transient, in-flight write
//! ```
//!
//! Write is atomic on POSIX: write tmp → fsync → rename. On a parse failure
//! at load time, we fall back to `.bak` so a corrupted main file doesn't
//! wipe history.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use parking_lot::Mutex;

use crate::errors::AppError;
use crate::model::AppData;

const DATA_FILE: &str = "data.json";
const BACKUP_FILE: &str = "data.json.bak";
const TMP_FILE: &str = "data.json.tmp";

pub struct Storage {
    dir: PathBuf,
    /// Serializes writes; reads pass through serde so concurrent reads are
    /// safe via the OS, but writes must not interleave with each other.
    write_lock: Mutex<()>,
}

impl Storage {
    pub fn new(dir: PathBuf) -> Result<Self, AppError> {
        fs::create_dir_all(&dir)?;
        Ok(Self {
            dir,
            write_lock: Mutex::new(()),
        })
    }

    fn data_path(&self) -> PathBuf {
        self.dir.join(DATA_FILE)
    }
    fn backup_path(&self) -> PathBuf {
        self.dir.join(BACKUP_FILE)
    }
    fn tmp_path(&self) -> PathBuf {
        self.dir.join(TMP_FILE)
    }

    /// Load `AppData` from disk. Falls back to `.bak` if the main file is
    /// missing or corrupt. Returns `AppData::default()` if both are absent.
    pub fn load(&self) -> Result<AppData, AppError> {
        let main = self.data_path();
        let backup = self.backup_path();

        match read_json(&main) {
            Ok(data) => Ok(data),
            Err(AppError::Io(e)) if e.kind() == std::io::ErrorKind::NotFound => {
                // First run, no file yet.
                Ok(AppData::default())
            }
            Err(main_err) => {
                log::warn!("main data file failed to load ({main_err}); trying backup");
                match read_json(&backup) {
                    Ok(data) => {
                        log::info!("loaded data from backup");
                        Ok(data)
                    }
                    Err(AppError::Io(e)) if e.kind() == std::io::ErrorKind::NotFound => {
                        log::error!("backup not found either; returning empty state");
                        Err(main_err)
                    }
                    Err(bak_err) => {
                        log::error!("backup also unreadable: {bak_err}");
                        Err(main_err)
                    }
                }
            }
        }
    }

    /// Persist `AppData` atomically. Writes `data.json.tmp`, fsyncs it,
    /// rotates current `data.json` → `data.json.bak`, then renames tmp
    /// into place.
    pub fn save(&self, data: &AppData) -> Result<(), AppError> {
        let _guard = self.write_lock.lock();
        let main = self.data_path();
        let backup = self.backup_path();
        let tmp = self.tmp_path();

        let bytes = serde_json::to_vec_pretty(data)?;

        // 1) Write tmp + fsync.
        {
            let mut file = OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(&tmp)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
        }

        // 2) Rotate main → backup (best effort).
        if main.exists() {
            if let Err(e) = fs::rename(&main, &backup) {
                log::warn!("could not rotate main to backup: {e}");
            }
        }

        // 3) Promote tmp → main.
        fs::rename(&tmp, &main)?;

        Ok(())
    }
}

fn read_json(path: &Path) -> Result<AppData, AppError> {
    let bytes = fs::read(path)?;
    let data = serde_json::from_slice(&bytes)?;
    Ok(data)
}
