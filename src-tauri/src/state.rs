//! Shared app state passed to Tauri command handlers.

use std::sync::Arc;

use parking_lot::RwLock;

use crate::errors::AppError;
use crate::model::AppData;
use crate::storage::Storage;

pub struct AppState {
    pub storage: Storage,
    pub data: RwLock<AppData>,
}

pub type SharedState = Arc<AppState>;

impl AppState {
    pub fn boot(storage: Storage) -> Result<SharedState, AppError> {
        let data = storage.load()?;
        Ok(Arc::new(Self {
            storage,
            data: RwLock::new(data),
        }))
    }

    /// Mutates state in-memory under a write lock, then persists.
    /// If persistence fails the in-memory mutation is *kept* but the error
    /// surfaces to the caller — recovery on next load will use the backup.
    pub fn mutate<F, R>(&self, f: F) -> Result<R, AppError>
    where
        F: FnOnce(&mut AppData) -> Result<R, AppError>,
    {
        let mut guard = self.data.write();
        let result = f(&mut guard)?;
        self.storage.save(&guard)?;
        Ok(result)
    }

    /// Replace the entire AppData (used by import). Persists atomically.
    pub fn replace(&self, new_data: AppData) -> Result<(), AppError> {
        let mut guard = self.data.write();
        *guard = new_data;
        self.storage.save(&guard)?;
        Ok(())
    }

    pub fn snapshot(&self) -> AppData {
        self.data.read().clone()
    }
}
