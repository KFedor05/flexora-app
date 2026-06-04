//! Day generation: turn habit definitions into per-day entry views.
//!
//! Storage rule: a `Day` is only stored in `AppData.days` once the user
//! interacts with it (marking something done, freezing, etc.). For dates
//! without stored data we synthesize on the fly from active habits so the
//! `data.json` stays small.

use chrono::{Datelike, NaiveDate};
use serde::Serialize;

use std::collections::HashMap;

use crate::model::{
    AppData, Day, DayEntry, DayStatus, EntryStatus, Frequency, Habit, HabitKind, PerfectDayStreak,
    Streak, Weekday,
};

/// Lightweight per-day summary for the calendar grid. Avoids shipping full
/// entry lists for every cell in a month.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayBrief {
    pub date: NaiveDate,
    pub day_status: DayStatus,
    pub done: u32,
    pub skipped: u32,
    pub total: u32,
    pub skipped_whole_day: bool,
}

/// Aggregated month-level totals for `months` view.
/// `green` = perfect days, `orange` = partial ≥50%, `red` = partial <50%.
/// Future dates are not counted.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthBrief {
    pub year: i32,
    pub month: u32,
    pub green: u32,
    pub orange: u32,
    pub red: u32,
}

/// What the frontend receives for a single date — habit definitions merged
/// with whatever the user has saved.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayView {
    pub date: NaiveDate,
    pub entries: Vec<DayEntryView>,
    pub day_status: DayStatus,
    pub skipped_whole_day: bool,
    pub progress: Progress,
    pub habit_streaks: HashMap<String, Streak>,
    pub perfect_day_streak: PerfectDayStreak,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub done: u32,
    pub skipped: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayEntryView {
    pub habit_id: String,
    pub status: EntryStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub counter_current: Option<f64>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Build a `DayView` for the given date.
pub fn build_day_view(data: &AppData, date: NaiveDate) -> DayView {
    let stored = data.days.get(&date.to_string()).cloned();
    let skipped_whole_day = stored.as_ref().is_some_and(|d| d.skipped_whole_day);

    let active_habits: Vec<&Habit> = data
        .habits
        .iter()
        .filter(|h| habit_active_on(h, date))
        .collect();

    let entries: Vec<DayEntryView> = active_habits
        .iter()
        .map(|h| {
            let stored_entry = stored
                .as_ref()
                .and_then(|d| d.entries.iter().find(|e| e.habit_id == h.id));
            match stored_entry {
                Some(e) => DayEntryView {
                    habit_id: e.habit_id.clone(),
                    status: e.status,
                    counter_current: e.counter_current,
                    completed_at: e.completed_at,
                },
                None => DayEntryView {
                    habit_id: h.id.clone(),
                    status: EntryStatus::Pending,
                    counter_current: if matches!(h.kind, HabitKind::Counter) {
                        Some(0.0)
                    } else {
                        None
                    },
                    completed_at: None,
                },
            }
        })
        .collect();

    let mut done = 0u32;
    let mut skipped = 0u32;
    for entry in &entries {
        match entry.status {
            EntryStatus::Done => done += 1,
            EntryStatus::Skipped => skipped += 1,
            EntryStatus::Pending => {}
        }
    }
    let total = entries.len() as u32;
    let day_status = derive_day_status(done, skipped, total, skipped_whole_day);

    let mut habit_streaks: HashMap<String, Streak> = HashMap::new();
    for h in &active_habits {
        if let Some(s) = data.streaks.get(&h.id) {
            habit_streaks.insert(h.id.clone(), s.clone());
        }
    }

    DayView {
        date,
        entries,
        day_status,
        skipped_whole_day,
        progress: Progress {
            done,
            skipped,
            total,
        },
        habit_streaks,
        perfect_day_streak: data.perfect_day_streak.clone(),
    }
}

/// Build a per-day summary for every date of the given month. Cheaper than
/// calling `build_day_view` 28-31 times: we skip streaks, entries, etc.
pub fn build_month_view(data: &AppData, year: i32, month: u32) -> Vec<DayBrief> {
    let first = match NaiveDate::from_ymd_opt(year, month, 1) {
        Some(d) => d,
        None => return Vec::new(),
    };
    let next_first = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)
    }
    .expect("month rollover always valid");
    let mut out = Vec::with_capacity(31);
    let mut date = first;
    while date < next_first {
        out.push(build_day_brief(data, date));
        date = date.succ_opt().expect("date in range");
    }
    out
}

fn build_day_brief(data: &AppData, date: NaiveDate) -> DayBrief {
    let stored = data.days.get(&date.to_string());
    let skipped_whole_day = stored.is_some_and(|d| d.skipped_whole_day);

    let total = data
        .habits
        .iter()
        .filter(|h| habit_active_on(h, date))
        .count() as u32;

    let (done, skipped) = match stored {
        Some(day) => {
            let mut d = 0u32;
            let mut s = 0u32;
            for e in &day.entries {
                match e.status {
                    EntryStatus::Done => d += 1,
                    EntryStatus::Skipped => s += 1,
                    EntryStatus::Pending => {}
                }
            }
            (d, s)
        }
        None => (0, 0),
    };
    let day_status = derive_day_status(done, skipped, total, skipped_whole_day);
    DayBrief {
        date,
        day_status,
        done,
        skipped,
        total,
        skipped_whole_day,
    }
}

/// Per-month aggregation across a single year. Only months up to and
/// including the current local month are counted (future months stay zero).
pub fn build_year_summary(data: &AppData, year: i32, today: NaiveDate) -> Vec<MonthBrief> {
    let mut out = Vec::with_capacity(12);
    for month in 1u32..=12 {
        if year > today.year() || (year == today.year() && month > today.month()) {
            out.push(MonthBrief {
                year,
                month,
                green: 0,
                orange: 0,
                red: 0,
            });
            continue;
        }
        let briefs = build_month_view(data, year, month);
        let mut g = 0u32;
        let mut o = 0u32;
        let mut r = 0u32;
        for b in &briefs {
            if b.date > today {
                continue;
            }
            match b.day_status {
                DayStatus::Perfect => g += 1,
                DayStatus::Partial => {
                    let progress = b.done + b.skipped;
                    let ratio = if b.total > 0 {
                        progress as f64 / b.total as f64
                    } else {
                        0.0
                    };
                    if ratio >= 0.5 {
                        o += 1;
                    } else {
                        r += 1;
                    }
                }
                DayStatus::Skipped => g += 1, // special days count as green
                DayStatus::Empty => {}
            }
        }
        out.push(MonthBrief {
            year,
            month,
            green: g,
            orange: o,
            red: r,
        });
    }
    out
}

/// Distinct years with at least one stored day, plus the current year (so
/// the user can always navigate into "this year"). Sorted descending.
pub fn years_with_data(data: &AppData, today: NaiveDate) -> Vec<i32> {
    let mut years: std::collections::BTreeSet<i32> = data
        .days
        .keys()
        .filter_map(|k| k.get(..4).and_then(|s| s.parse::<i32>().ok()))
        .collect();
    years.insert(today.year());
    let mut out: Vec<i32> = years.into_iter().collect();
    out.sort_by(|a, b| b.cmp(a));
    out
}

/// Idempotent: writes the merged entries back into `data.days[date]` so
/// later mutations have a starting point.
pub fn materialize_day(data: &mut AppData, date: NaiveDate) -> &mut Day {
    let view = build_day_view(data, date);
    let key = date.to_string();
    let entry = data.days.entry(key).or_insert_with(|| Day {
        entries: Vec::new(),
        day_status: view.day_status,
        skipped_whole_day: false,
    });

    // Ensure every active habit has an entry row.
    let existing_ids: std::collections::HashSet<String> =
        entry.entries.iter().map(|e| e.habit_id.clone()).collect();
    for v in view.entries.iter() {
        if !existing_ids.contains(&v.habit_id) {
            entry.entries.push(DayEntry {
                habit_id: v.habit_id.clone(),
                status: v.status,
                counter_current: v.counter_current,
                completed_at: v.completed_at,
            });
        }
    }
    entry
}

/// Recompute the cached `day_status` for a stored day. Returns the new value.
pub fn recompute_day_status(data: &mut AppData, date: NaiveDate) -> DayStatus {
    let key = date.to_string();
    let (status, should_drop) = {
        let Some(day) = data.days.get(&key) else {
            return DayStatus::Empty;
        };
        let total_active = data
            .habits
            .iter()
            .filter(|h| habit_active_on(h, date))
            .count() as u32;
        let mut done = 0u32;
        let mut skipped = 0u32;
        for e in &day.entries {
            match e.status {
                EntryStatus::Done => done += 1,
                EntryStatus::Skipped => skipped += 1,
                EntryStatus::Pending => {}
            }
        }
        let status = derive_day_status(done, skipped, total_active, day.skipped_whole_day);
        // Drop the stored Day only if it carries no progress at all. Counter
        // values above zero count as progress even when status is Pending.
        let has_progress = day.entries.iter().any(|e| {
            !matches!(e.status, EntryStatus::Pending) || e.counter_current.is_some_and(|v| v > 0.0)
        });
        let nothing_to_remember = !day.skipped_whole_day && !has_progress;
        (status, nothing_to_remember)
    };

    if should_drop {
        data.days.remove(&key);
        return DayStatus::Empty;
    }
    if let Some(day) = data.days.get_mut(&key) {
        day.day_status = status;
    }
    status
}

pub fn derive_day_status(
    done: u32,
    skipped: u32,
    total: u32,
    skipped_whole_day: bool,
) -> DayStatus {
    if skipped_whole_day {
        return DayStatus::Skipped;
    }
    if total == 0 {
        return DayStatus::Empty;
    }
    if done + skipped == total {
        return DayStatus::Perfect;
    }
    if done > 0 || skipped > 0 {
        return DayStatus::Partial;
    }
    DayStatus::Empty
}

pub fn habit_active_on(habit: &Habit, date: NaiveDate) -> bool {
    if habit.archived {
        return false;
    }
    if date < habit.start_date {
        return false;
    }
    if let Some(end) = habit.end_date {
        if date > end {
            return false;
        }
    }
    if habit.completed {
        // Completed habits should still appear for past dates up to completedAt.
        if let Some(completed_at) = habit.completed_at {
            if date > completed_at.date_naive() {
                return false;
            }
        } else {
            return false;
        }
    }
    match &habit.frequency {
        Frequency::ByDays { days, .. } => {
            let w: Weekday = date.weekday().into();
            days.contains(&w)
        }
        Frequency::Interval { interval_days } => {
            if *interval_days == 0 {
                return false;
            }
            let diff = (date - habit.start_date).num_days();
            diff >= 0 && diff % (*interval_days as i64) == 0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{NaiveDate, Utc};

    fn habit_by_days(days: Vec<Weekday>, start: NaiveDate) -> Habit {
        Habit {
            id: "h1".into(),
            title: "t".into(),
            section_id: "morning".into(),
            kind: HabitKind::Checkbox,
            counter: None,
            frequency: Frequency::ByDays {
                days,
                preset: crate::model::FrequencyPreset::Custom,
            },
            start_date: start,
            end_date: None,
            goal_preset: crate::model::GoalPreset::Indefinite,
            order: 0,
            archived: false,
            completed: false,
            completed_at: None,
            created_at: Utc::now(),
        }
    }

    #[test]
    fn weekdays_match_only_listed_days() {
        let h = habit_by_days(
            vec![Weekday::Mon, Weekday::Wed],
            NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
        );
        // 2026-06-01 is Monday.
        assert!(habit_active_on(
            &h,
            NaiveDate::from_ymd_opt(2026, 6, 1).unwrap()
        ));
        assert!(!habit_active_on(
            &h,
            NaiveDate::from_ymd_opt(2026, 6, 2).unwrap()
        )); // Tue
        assert!(habit_active_on(
            &h,
            NaiveDate::from_ymd_opt(2026, 6, 3).unwrap()
        )); // Wed
    }

    #[test]
    fn interval_pattern_works() {
        let h = Habit {
            id: "h".into(),
            title: "t".into(),
            section_id: "morning".into(),
            kind: HabitKind::Checkbox,
            counter: None,
            frequency: Frequency::Interval { interval_days: 3 },
            start_date: NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
            end_date: None,
            goal_preset: crate::model::GoalPreset::Indefinite,
            order: 0,
            archived: false,
            completed: false,
            completed_at: None,
            created_at: Utc::now(),
        };
        assert!(habit_active_on(
            &h,
            NaiveDate::from_ymd_opt(2026, 6, 1).unwrap()
        ));
        assert!(!habit_active_on(
            &h,
            NaiveDate::from_ymd_opt(2026, 6, 2).unwrap()
        ));
        assert!(habit_active_on(
            &h,
            NaiveDate::from_ymd_opt(2026, 6, 4).unwrap()
        ));
        assert!(habit_active_on(
            &h,
            NaiveDate::from_ymd_opt(2026, 6, 7).unwrap()
        ));
    }

    #[test]
    fn before_start_date_inactive() {
        let h = habit_by_days(
            vec![Weekday::Mon],
            NaiveDate::from_ymd_opt(2026, 6, 8).unwrap(),
        );
        assert!(!habit_active_on(
            &h,
            NaiveDate::from_ymd_opt(2026, 6, 1).unwrap()
        ));
        assert!(habit_active_on(
            &h,
            NaiveDate::from_ymd_opt(2026, 6, 8).unwrap()
        ));
    }

    #[test]
    fn day_status_perfect_when_all_done() {
        assert_eq!(derive_day_status(5, 0, 5, false), DayStatus::Perfect);
        assert_eq!(derive_day_status(3, 2, 5, false), DayStatus::Perfect);
    }

    #[test]
    fn day_status_partial_with_progress() {
        assert_eq!(derive_day_status(2, 0, 5, false), DayStatus::Partial);
    }

    #[test]
    fn day_status_empty_no_progress() {
        assert_eq!(derive_day_status(0, 0, 5, false), DayStatus::Empty);
        assert_eq!(derive_day_status(0, 0, 0, false), DayStatus::Empty);
    }

    #[test]
    fn day_status_skipped_whole_day_overrides() {
        assert_eq!(derive_day_status(0, 0, 0, true), DayStatus::Skipped);
        assert_eq!(derive_day_status(2, 0, 5, true), DayStatus::Skipped);
    }

    #[test]
    fn counter_progress_kept_even_without_done_checkbox() {
        // Regression: setting a counter below its target while every other
        // entry is Pending must not drop the stored day — otherwise the
        // counter value bounces back to zero on the next read.
        use crate::model::{AppData, CounterConfig, Day, DayEntry, FrequencyPreset};

        let mut data = AppData::default();
        let start = NaiveDate::from_ymd_opt(2026, 6, 3).unwrap();
        let counter_habit = Habit {
            id: "c".into(),
            title: "Water".into(),
            section_id: "morning".into(),
            kind: HabitKind::Counter,
            counter: Some(CounterConfig {
                target: 2.0,
                unit: "l".into(),
                steps: vec![0.2],
            }),
            frequency: Frequency::ByDays {
                days: vec![Weekday::Wed],
                preset: FrequencyPreset::Custom,
            },
            start_date: start,
            end_date: None,
            goal_preset: crate::model::GoalPreset::Indefinite,
            order: 0,
            archived: false,
            completed: false,
            completed_at: None,
            created_at: Utc::now(),
        };
        data.habits.push(counter_habit);
        data.days.insert(
            start.to_string(),
            Day {
                entries: vec![DayEntry {
                    habit_id: "c".into(),
                    status: EntryStatus::Pending,
                    counter_current: Some(0.4),
                    completed_at: None,
                }],
                day_status: DayStatus::Empty,
                skipped_whole_day: false,
            },
        );

        recompute_day_status(&mut data, start);
        assert!(
            data.days.contains_key(&start.to_string()),
            "day must be kept when counter has progress",
        );

        let view = build_day_view(&data, start);
        assert_eq!(view.entries[0].counter_current, Some(0.4));
    }

    #[test]
    fn empty_day_with_no_progress_gets_dropped() {
        use crate::model::{AppData, Day, DayEntry, FrequencyPreset};

        let mut data = AppData::default();
        let start = NaiveDate::from_ymd_opt(2026, 6, 3).unwrap();
        data.habits.push(Habit {
            id: "h".into(),
            title: "t".into(),
            section_id: "morning".into(),
            kind: HabitKind::Checkbox,
            counter: None,
            frequency: Frequency::ByDays {
                days: vec![Weekday::Wed],
                preset: FrequencyPreset::Custom,
            },
            start_date: start,
            end_date: None,
            goal_preset: crate::model::GoalPreset::Indefinite,
            order: 0,
            archived: false,
            completed: false,
            completed_at: None,
            created_at: Utc::now(),
        });
        data.days.insert(
            start.to_string(),
            Day {
                entries: vec![DayEntry {
                    habit_id: "h".into(),
                    status: EntryStatus::Pending,
                    counter_current: None,
                    completed_at: None,
                }],
                day_status: DayStatus::Empty,
                skipped_whole_day: false,
            },
        );
        recompute_day_status(&mut data, start);
        assert!(!data.days.contains_key(&start.to_string()));
    }
}
