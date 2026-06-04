//! Server-side validation. Mirror of UI rules — but Rust is the trust
//! boundary: the frontend can be bypassed, this can't.

use chrono::NaiveDate;

use crate::errors::AppError;
use crate::model::{CounterConfig, HabitInput, HabitKind, HabitPatch, AppData};

pub const MAX_TITLE_LEN: usize = 60;
pub const MAX_SECTION_NAME_LEN: usize = 40;
pub const MAX_STEPS: usize = 5;

pub fn validate_title(title: &str) -> Result<(), AppError> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("title is empty".into()));
    }
    if title.chars().count() > MAX_TITLE_LEN {
        return Err(AppError::Validation(format!(
            "title is longer than {MAX_TITLE_LEN} characters"
        )));
    }
    Ok(())
}

pub fn validate_section_name(name: &str) -> Result<(), AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("section name is empty".into()));
    }
    if name.chars().count() > MAX_SECTION_NAME_LEN {
        return Err(AppError::Validation(format!(
            "section name is longer than {MAX_SECTION_NAME_LEN} characters"
        )));
    }
    Ok(())
}

pub fn validate_counter(cfg: &CounterConfig) -> Result<(), AppError> {
    if !(cfg.target.is_finite() && cfg.target > 0.0) {
        return Err(AppError::Validation(
            "counter target must be a positive number".into(),
        ));
    }
    if cfg.steps.is_empty() {
        return Err(AppError::Validation(
            "counter needs at least one step".into(),
        ));
    }
    if cfg.steps.len() > MAX_STEPS {
        return Err(AppError::Validation(format!(
            "counter has more than {MAX_STEPS} steps"
        )));
    }
    for step in &cfg.steps {
        if !(step.is_finite() && *step > 0.0) {
            return Err(AppError::Validation(
                "counter step must be a positive number".into(),
            ));
        }
    }
    Ok(())
}

pub fn validate_section_exists(data: &AppData, section_id: &str) -> Result<(), AppError> {
    if data.sections.iter().any(|s| s.id == section_id) {
        Ok(())
    } else {
        Err(AppError::NotFound(format!("section {section_id}")))
    }
}

pub fn validate_habit_input(data: &AppData, input: &HabitInput) -> Result<(), AppError> {
    validate_title(&input.title)?;
    validate_section_exists(data, &input.section_id)?;
    match (input.kind, &input.counter) {
        (HabitKind::Counter, Some(cfg)) => validate_counter(cfg)?,
        (HabitKind::Counter, None) => {
            return Err(AppError::Validation(
                "counter habit requires counter config".into(),
            ));
        }
        (HabitKind::Checkbox, Some(_)) => {
            return Err(AppError::Validation(
                "checkbox habit must not have counter config".into(),
            ));
        }
        (HabitKind::Checkbox, None) => {}
    }
    if let Some(end) = input.end_date {
        if end < input.start_date {
            return Err(AppError::Validation(
                "endDate is before startDate".into(),
            ));
        }
    }
    Ok(())
}

pub fn validate_habit_patch(
    data: &AppData,
    patch: &HabitPatch,
    start_date: NaiveDate,
    today: NaiveDate,
) -> Result<(), AppError> {
    if let Some(title) = &patch.title {
        validate_title(title)?;
    }
    if let Some(section_id) = &patch.section_id {
        validate_section_exists(data, section_id)?;
    }
    if let Some(cfg) = &patch.counter {
        validate_counter(cfg)?;
    }
    if let Some(new_end) = patch.end_date {
        if let Some(end) = new_end {
            if end < start_date {
                return Err(AppError::Validation(
                    "endDate is before startDate".into(),
                ));
            }
            if end < today {
                return Err(AppError::Validation(
                    "endDate cannot be moved into the past".into(),
                ));
            }
        }
    }
    Ok(())
}
