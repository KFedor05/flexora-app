use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("tauri: {0}")]
    Tauri(#[from] tauri::Error),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("invalid: {0}")]
    Validation(String),
    #[error("conflict: {0}")]
    Conflict(String),
}

/// Result type for Tauri commands — serializes the error as a plain string
/// so the JS side gets a readable message.
pub type CmdResult<T> = Result<T, String>;

impl From<AppError> for String {
    fn from(e: AppError) -> String {
        e.to_string()
    }
}
