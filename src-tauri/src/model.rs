//! Data model for Flexora.
//!
//! Single source of truth — JSON serialization uses camelCase to match the
//! schema described in `PLAN.md` and the JS layer.

use std::collections::{BTreeMap, HashMap};

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

pub const SCHEMA_VERSION: u32 = 1;

// -------------------- Habits --------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HabitKind {
    Checkbox,
    Counter,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterConfig {
    pub target: f64,
    pub unit: String,
    /// 1..=5 positive step values that render as paired +X / -X buttons.
    pub steps: Vec<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Weekday {
    Mon,
    Tue,
    Wed,
    Thu,
    Fri,
    Sat,
    Sun,
}

impl From<chrono::Weekday> for Weekday {
    fn from(w: chrono::Weekday) -> Self {
        match w {
            chrono::Weekday::Mon => Weekday::Mon,
            chrono::Weekday::Tue => Weekday::Tue,
            chrono::Weekday::Wed => Weekday::Wed,
            chrono::Weekday::Thu => Weekday::Thu,
            chrono::Weekday::Fri => Weekday::Fri,
            chrono::Weekday::Sat => Weekday::Sat,
            chrono::Weekday::Sun => Weekday::Sun,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FrequencyPreset {
    All,
    Weekdays,
    Weekends,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Frequency {
    #[serde(rename = "byDays")]
    ByDays {
        days: Vec<Weekday>,
        preset: FrequencyPreset,
    },
    #[serde(rename = "interval")]
    Interval {
        #[serde(rename = "intervalDays")]
        interval_days: u32,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GoalPreset {
    #[serde(rename = "indefinite")]
    Indefinite,
    #[serde(rename = "7d")]
    SevenDays,
    #[serde(rename = "30d")]
    ThirtyDays,
    #[serde(rename = "100d")]
    HundredDays,
    #[serde(rename = "365d")]
    YearDays,
    #[serde(rename = "custom")]
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Habit {
    pub id: String,
    pub title: String,
    pub section_id: String,
    #[serde(rename = "type")]
    pub kind: HabitKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub counter: Option<CounterConfig>,
    pub frequency: Frequency,
    pub start_date: NaiveDate,
    pub end_date: Option<NaiveDate>,
    pub goal_preset: GoalPreset,
    pub order: u32,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub completed: bool,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

// -------------------- Sections --------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    pub id: String,
    pub name: String,
    pub order: u32,
    pub is_default: bool,
}

// -------------------- Days --------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryStatus {
    Done,
    Pending,
    Skipped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DayStatus {
    Perfect,
    Partial,
    Empty,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayEntry {
    pub habit_id: String,
    pub status: EntryStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub counter_current: Option<f64>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Day {
    pub entries: Vec<DayEntry>,
    pub day_status: DayStatus,
    #[serde(default)]
    pub skipped_whole_day: bool,
}

// -------------------- Streaks --------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Streak {
    pub current: u32,
    pub longest: u32,
    pub last_completed_date: Option<NaiveDate>,
    pub frozen_by_date: Option<NaiveDate>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfectDayStreak {
    pub current: u32,
    pub longest: u32,
    pub last_perfect_date: Option<NaiveDate>,
}

// -------------------- Settings --------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemeChoice {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: ThemeChoice,
    pub language: String,
    pub auto_start: bool,
    pub minimize_to_tray: bool,
    pub open_to_today: bool,
    pub first_launch_done: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: ThemeChoice::System,
            language: "en".into(),
            auto_start: false,
            minimize_to_tray: true,
            open_to_today: true,
            first_launch_done: false,
        }
    }
}

// -------------------- Root --------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppData {
    pub schema_version: u32,
    pub habits: Vec<Habit>,
    pub sections: Vec<Section>,
    /// Key: ISO date "YYYY-MM-DD".
    pub days: BTreeMap<String, Day>,
    /// Key: habit id.
    pub streaks: HashMap<String, Streak>,
    pub perfect_day_streak: PerfectDayStreak,
    pub settings: Settings,
}

impl Default for AppData {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            habits: Vec::new(),
            sections: default_sections(),
            days: BTreeMap::new(),
            streaks: HashMap::new(),
            perfect_day_streak: PerfectDayStreak::default(),
            settings: Settings::default(),
        }
    }
}

fn default_sections() -> Vec<Section> {
    vec![
        Section {
            id: "morning".into(),
            name: "Morning".into(),
            order: 0,
            is_default: true,
        },
        Section {
            id: "day".into(),
            name: "Day".into(),
            order: 1,
            is_default: true,
        },
        Section {
            id: "evening".into(),
            name: "Evening".into(),
            order: 2,
            is_default: true,
        },
        Section {
            id: "other".into(),
            name: "Other".into(),
            order: 3,
            is_default: true,
        },
    ]
}

// -------------------- Input shapes for commands --------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitInput {
    pub title: String,
    pub section_id: String,
    #[serde(rename = "type")]
    pub kind: HabitKind,
    #[serde(default)]
    pub counter: Option<CounterConfig>,
    pub frequency: Frequency,
    pub start_date: NaiveDate,
    pub end_date: Option<NaiveDate>,
    pub goal_preset: GoalPreset,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitPatch {
    pub title: Option<String>,
    pub section_id: Option<String>,
    pub counter: Option<CounterConfig>,
    pub frequency: Option<Frequency>,
    pub end_date: Option<Option<NaiveDate>>,
    pub goal_preset: Option<GoalPreset>,
    pub order: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub theme: Option<ThemeChoice>,
    pub language: Option<String>,
    pub auto_start: Option<bool>,
    pub minimize_to_tray: Option<bool>,
    pub open_to_today: Option<bool>,
    pub first_launch_done: Option<bool>,
}
