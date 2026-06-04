//! Tauri command handlers. All commands return `Result<T, String>` so the
//! JS side gets a readable error message instead of a panic.

use chrono::{Local, NaiveDate, Utc};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::day_engine::{self, DayBrief, DayView, MonthBrief};
use crate::errors::{AppError, CmdResult};
use crate::model::{
    AppData, EntryStatus, Habit, HabitInput, HabitPatch, Section, Settings, SettingsPatch,
    SCHEMA_VERSION,
};
use crate::state::SharedState;
use crate::streaks;
use crate::validate;

fn today() -> chrono::NaiveDate {
    Local::now().date_naive()
}

fn ensure_not_future(date: NaiveDate) -> Result<(), AppError> {
    if date > today() {
        return Err(AppError::Validation(
            "future dates cannot be edited".into(),
        ));
    }
    Ok(())
}

fn next_section_order(data: &AppData) -> u32 {
    data.sections.iter().map(|s| s.order).max().map_or(0, |o| o + 1)
}

fn next_habit_order_in_section(data: &AppData, section_id: &str) -> u32 {
    data.habits
        .iter()
        .filter(|h| h.section_id == section_id && !h.archived)
        .map(|h| h.order)
        .max()
        .map_or(0, |o| o + 1)
}

#[tauri::command]
pub fn load_app_data(state: State<'_, SharedState>) -> CmdResult<AppData> {
    Ok(state.snapshot())
}

#[tauri::command]
pub fn create_habit(
    input: HabitInput,
    state: State<'_, SharedState>,
) -> CmdResult<Habit> {
    state
        .mutate(|data| {
            validate::validate_habit_input(data, &input)?;
            let habit = Habit {
                id: Uuid::new_v4().to_string(),
                title: input.title.trim().to_string(),
                section_id: input.section_id.clone(),
                kind: input.kind,
                counter: input.counter.clone(),
                frequency: input.frequency.clone(),
                start_date: input.start_date,
                end_date: input.end_date,
                goal_preset: input.goal_preset,
                order: next_habit_order_in_section(data, &input.section_id),
                archived: false,
                completed: false,
                completed_at: None,
                created_at: Utc::now(),
            };
            data.habits.push(habit.clone());
            Ok(habit)
        })
        .map_err(Into::into)
}

#[tauri::command]
pub fn update_habit(
    id: String,
    patch: HabitPatch,
    state: State<'_, SharedState>,
) -> CmdResult<Habit> {
    state
        .mutate(|data| {
            let start_date = data
                .habits
                .iter()
                .find(|h| h.id == id)
                .map(|h| h.start_date)
                .ok_or_else(|| AppError::NotFound(format!("habit {id}")))?;
            validate::validate_habit_patch(data, &patch, start_date, today())?;

            let habit = data
                .habits
                .iter_mut()
                .find(|h| h.id == id)
                .ok_or_else(|| AppError::NotFound(format!("habit {id}")))?;

            if let Some(title) = patch.title {
                habit.title = title.trim().to_string();
            }
            if let Some(section_id) = patch.section_id {
                habit.section_id = section_id;
            }
            if let Some(counter) = patch.counter {
                habit.counter = Some(counter);
            }
            if let Some(frequency) = patch.frequency {
                habit.frequency = frequency;
            }
            if let Some(end_date) = patch.end_date {
                habit.end_date = end_date;
            }
            if let Some(goal_preset) = patch.goal_preset {
                habit.goal_preset = goal_preset;
            }
            if let Some(order) = patch.order {
                habit.order = order;
            }
            Ok(habit.clone())
        })
        .map_err(Into::into)
}

#[tauri::command]
pub fn archive_habit(id: String, state: State<'_, SharedState>) -> CmdResult<()> {
    state
        .mutate(|data| {
            let habit = data
                .habits
                .iter_mut()
                .find(|h| h.id == id)
                .ok_or_else(|| AppError::NotFound(format!("habit {id}")))?;
            habit.archived = true;
            Ok(())
        })
        .map_err(Into::into)
}

#[tauri::command]
pub fn complete_habit(id: String, state: State<'_, SharedState>) -> CmdResult<Habit> {
    state
        .mutate(|data| {
            let habit = data
                .habits
                .iter_mut()
                .find(|h| h.id == id)
                .ok_or_else(|| AppError::NotFound(format!("habit {id}")))?;
            habit.completed = true;
            habit.completed_at = Some(Utc::now());
            Ok(habit.clone())
        })
        .map_err(Into::into)
}

// -------------------- Sections --------------------

#[tauri::command]
pub fn create_section(name: String, state: State<'_, SharedState>) -> CmdResult<Section> {
    state
        .mutate(|data| {
            validate::validate_section_name(&name)?;
            let section = Section {
                id: Uuid::new_v4().to_string(),
                name: name.trim().to_string(),
                order: next_section_order(data),
                is_default: false,
            };
            data.sections.push(section.clone());
            Ok(section)
        })
        .map_err(Into::into)
}

#[tauri::command]
pub fn update_section(
    id: String,
    name: Option<String>,
    order: Option<u32>,
    state: State<'_, SharedState>,
) -> CmdResult<Section> {
    state
        .mutate(|data| {
            if let Some(name) = &name {
                validate::validate_section_name(name)?;
            }
            let section = data
                .sections
                .iter_mut()
                .find(|s| s.id == id)
                .ok_or_else(|| AppError::NotFound(format!("section {id}")))?;
            if let Some(name) = name {
                section.name = name.trim().to_string();
            }
            if let Some(order) = order {
                section.order = order;
            }
            Ok(section.clone())
        })
        .map_err(Into::into)
}

#[tauri::command]
pub fn delete_section(
    id: String,
    move_to: String,
    state: State<'_, SharedState>,
) -> CmdResult<()> {
    state
        .mutate(|data| {
            let target_exists = data.sections.iter().any(|s| s.id == move_to);
            if !target_exists {
                return Err(AppError::NotFound(format!("section {move_to}")));
            }
            let removed = data
                .sections
                .iter()
                .find(|s| s.id == id)
                .ok_or_else(|| AppError::NotFound(format!("section {id}")))?;
            if removed.is_default {
                return Err(AppError::Conflict(
                    "default sections cannot be deleted".into(),
                ));
            }
            for habit in data.habits.iter_mut() {
                if habit.section_id == id {
                    habit.section_id = move_to.clone();
                }
            }
            data.sections.retain(|s| s.id != id);
            Ok(())
        })
        .map_err(Into::into)
}

// -------------------- Days --------------------

#[tauri::command]
pub fn get_day(date: String, state: State<'_, SharedState>) -> CmdResult<DayView> {
    let parsed: NaiveDate = date
        .parse()
        .map_err(|_| AppError::Validation(format!("invalid date {date}")))?;
    let snapshot = state.snapshot();
    Ok(day_engine::build_day_view(&snapshot, parsed))
}

#[tauri::command]
pub fn toggle_entry(
    date: String,
    habit_id: String,
    state: State<'_, SharedState>,
) -> CmdResult<DayView> {
    let parsed: NaiveDate = date
        .parse()
        .map_err(|_| AppError::Validation(format!("invalid date {date}")))?;
    ensure_not_future(parsed)?;
    let today = today();

    state
        .mutate(|data| {
            // Habit must exist and be active on this date.
            let habit = data
                .habits
                .iter()
                .find(|h| h.id == habit_id)
                .ok_or_else(|| AppError::NotFound(format!("habit {habit_id}")))?;
            if !day_engine::habit_active_on(habit, parsed) {
                return Err(AppError::Validation(
                    "habit not active on this date".into(),
                ));
            }

            day_engine::materialize_day(data, parsed);
            let key = parsed.to_string();
            let day = data.days.get_mut(&key).expect("materialized above");
            if let Some(entry) = day.entries.iter_mut().find(|e| e.habit_id == habit_id) {
                entry.status = match entry.status {
                    EntryStatus::Done => EntryStatus::Pending,
                    _ => EntryStatus::Done,
                };
                entry.completed_at = match entry.status {
                    EntryStatus::Done => Some(Utc::now()),
                    _ => None,
                };
            }
            day_engine::recompute_day_status(data, parsed);
            streaks::recompute_habit_streak(data, &habit_id, today);
            streaks::recompute_perfect_day_streak(data, today);
            Ok(day_engine::build_day_view(data, parsed))
        })
        .map_err(Into::into)
}

#[tauri::command]
pub fn set_entry_counter(
    date: String,
    habit_id: String,
    value: f64,
    state: State<'_, SharedState>,
) -> CmdResult<DayView> {
    let parsed: NaiveDate = date
        .parse()
        .map_err(|_| AppError::Validation(format!("invalid date {date}")))?;
    ensure_not_future(parsed)?;
    if !value.is_finite() || value < 0.0 {
        return Err(AppError::Validation(
            "counter value must be a non-negative finite number".into(),
        )
        .into());
    }
    state
        .mutate(|data| {
            let habit = data
                .habits
                .iter()
                .find(|h| h.id == habit_id)
                .ok_or_else(|| AppError::NotFound(format!("habit {habit_id}")))?;
            let target = habit
                .counter
                .as_ref()
                .map(|c| c.target)
                .ok_or_else(|| AppError::Validation("habit is not a counter".into()))?;

            day_engine::materialize_day(data, parsed);
            let key = parsed.to_string();
            let day = data.days.get_mut(&key).expect("materialized above");
            let entry = day
                .entries
                .iter_mut()
                .find(|e| e.habit_id == habit_id)
                .ok_or_else(|| AppError::NotFound(format!("entry {habit_id}")))?;
            entry.counter_current = Some(value);
            // Achieving the goal flips the entry to "done".
            entry.status = if value >= target {
                EntryStatus::Done
            } else {
                EntryStatus::Pending
            };
            entry.completed_at = if matches!(entry.status, EntryStatus::Done) {
                Some(Utc::now())
            } else {
                None
            };
            day_engine::recompute_day_status(data, parsed);
            streaks::recompute_habit_streak(data, &habit_id, today());
            streaks::recompute_perfect_day_streak(data, today());
            Ok(day_engine::build_day_view(data, parsed))
        })
        .map_err(Into::into)
}

#[tauri::command]
pub fn toggle_freeze_entry(
    date: String,
    habit_id: String,
    state: State<'_, SharedState>,
) -> CmdResult<DayView> {
    let parsed: NaiveDate = date
        .parse()
        .map_err(|_| AppError::Validation(format!("invalid date {date}")))?;
    ensure_not_future(parsed)?;
    state
        .mutate(|data| {
            let habit = data
                .habits
                .iter()
                .find(|h| h.id == habit_id)
                .ok_or_else(|| AppError::NotFound(format!("habit {habit_id}")))?;
            if !day_engine::habit_active_on(habit, parsed) {
                return Err(AppError::Validation(
                    "habit not active on this date".into(),
                ));
            }

            day_engine::materialize_day(data, parsed);
            let key = parsed.to_string();
            let day = data.days.get_mut(&key).expect("materialized above");
            if let Some(entry) = day.entries.iter_mut().find(|e| e.habit_id == habit_id) {
                // Already Done — freeze is a no-op (we don't want to roll back
                // a completed task and lose its streak point).
                match entry.status {
                    EntryStatus::Done => {}
                    EntryStatus::Skipped => {
                        entry.status = EntryStatus::Pending;
                        entry.completed_at = None;
                    }
                    EntryStatus::Pending => {
                        entry.status = EntryStatus::Skipped;
                        entry.completed_at = None;
                    }
                }
            }
            day_engine::recompute_day_status(data, parsed);
            streaks::recompute_habit_streak(data, &habit_id, today());
            streaks::recompute_perfect_day_streak(data, today());
            Ok(day_engine::build_day_view(data, parsed))
        })
        .map_err(Into::into)
}

#[tauri::command]
pub fn toggle_skip_day(date: String, state: State<'_, SharedState>) -> CmdResult<DayView> {
    let parsed: NaiveDate = date
        .parse()
        .map_err(|_| AppError::Validation(format!("invalid date {date}")))?;
    ensure_not_future(parsed)?;
    state
        .mutate(|data| {
            day_engine::materialize_day(data, parsed);
            let key = parsed.to_string();
            let day = data.days.get_mut(&key).expect("materialized above");
            day.skipped_whole_day = !day.skipped_whole_day;
            day_engine::recompute_day_status(data, parsed);
            streaks::recompute_all_streaks(data, today());
            Ok(day_engine::build_day_view(data, parsed))
        })
        .map_err(Into::into)
}

#[tauri::command]
pub fn get_month(
    year: i32,
    month: u32,
    state: State<'_, SharedState>,
) -> CmdResult<Vec<DayBrief>> {
    if !(1..=12).contains(&month) {
        return Err(AppError::Validation(format!("invalid month {month}")).into());
    }
    let snapshot = state.snapshot();
    Ok(day_engine::build_month_view(&snapshot, year, month))
}

#[tauri::command]
pub fn get_year(year: i32, state: State<'_, SharedState>) -> CmdResult<Vec<MonthBrief>> {
    let snapshot = state.snapshot();
    Ok(day_engine::build_year_summary(&snapshot, year, today()))
}

#[tauri::command]
pub fn get_years(state: State<'_, SharedState>) -> CmdResult<Vec<i32>> {
    let snapshot = state.snapshot();
    Ok(day_engine::years_with_data(&snapshot, today()))
}

#[tauri::command]
pub fn today_iso() -> CmdResult<String> {
    Ok(today().to_string())
}

// -------------------- Settings --------------------

#[tauri::command]
pub fn get_settings(state: State<'_, SharedState>) -> CmdResult<Settings> {
    Ok(state.snapshot().settings)
}

#[tauri::command]
pub fn app_version() -> CmdResult<String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

#[tauri::command]
pub fn data_dir(app: AppHandle) -> CmdResult<String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Validation(format!("app_data_dir unavailable: {e}")))?;
    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn export_to_path(path: String, state: State<'_, SharedState>) -> CmdResult<()> {
    let snapshot = state.snapshot();
    let bytes = serde_json::to_vec_pretty(&snapshot)
        .map_err(|e| AppError::Validation(format!("serialize failed: {e}")))?;
    std::fs::write(&path, bytes).map_err(|e| AppError::Io(e))?;
    Ok(())
}

#[tauri::command]
pub fn import_from_path(path: String, state: State<'_, SharedState>) -> CmdResult<AppData> {
    let bytes = std::fs::read(&path).map_err(|e| AppError::Io(e))?;
    let mut imported: AppData = serde_json::from_slice(&bytes)
        .map_err(|e| AppError::Validation(format!("invalid backup file: {e}")))?;

    if imported.schema_version != SCHEMA_VERSION {
        return Err(AppError::Validation(format!(
            "unsupported schema version {} (this build expects {})",
            imported.schema_version, SCHEMA_VERSION,
        ))
        .into());
    }

    // Recompute streaks against the imported state so they stay consistent
    // with the data even if the backup was taken from a different build.
    streaks::recompute_all_streaks(&mut imported, today());

    state.replace(imported.clone()).map_err(Into::<String>::into)?;
    Ok(imported)
}

#[tauri::command]
pub fn update_settings(
    patch: SettingsPatch,
    state: State<'_, SharedState>,
) -> CmdResult<Settings> {
    state
        .mutate(|data| {
            let s = &mut data.settings;
            if let Some(theme) = patch.theme {
                s.theme = theme;
            }
            if let Some(language) = patch.language {
                s.language = language;
            }
            if let Some(auto_start) = patch.auto_start {
                s.auto_start = auto_start;
            }
            if let Some(mtt) = patch.minimize_to_tray {
                s.minimize_to_tray = mtt;
            }
            if let Some(open_to_today) = patch.open_to_today {
                s.open_to_today = open_to_today;
            }
            if let Some(first_launch_done) = patch.first_launch_done {
                s.first_launch_done = first_launch_done;
            }
            Ok(s.clone())
        })
        .map_err(Into::into)
}
