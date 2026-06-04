//! Streak engine.
//!
//! Per-habit streak (consecutive expected days marked Done or Skipped) and a
//! meta perfect-day streak (consecutive days where every active habit was
//! Done or Skipped, or the whole day was marked skipped).
//!
//! Walking rules (for both kinds):
//! - We only count *expected* days for that habit (frequency-aware).
//! - `Done` increments the streak by one.
//! - `Skipped` (the "freeze" button) preserves the streak — neither breaks it
//!   nor grows it.
//! - `Pending` in the past breaks the streak.
//! - `Pending` *today* doesn't break the streak: the user might still mark
//!   it later in the day.
//! - Days before `startDate` end the walk.

use chrono::NaiveDate;

use crate::day_engine;
use crate::model::{AppData, DayStatus, EntryStatus, Habit, Streak};

/// Compute the per-habit streak as of `today`. Also returns the date the
/// streak last grew (`last_completed_date`), used by JS to render "since X".
pub fn compute_habit_streak(
    data: &AppData,
    habit: &Habit,
    today: NaiveDate,
) -> (u32, Option<NaiveDate>) {
    let mut date = today;
    let mut streak = 0u32;
    let mut last_completed: Option<NaiveDate> = None;

    loop {
        if date < habit.start_date {
            break;
        }
        if day_engine::habit_active_on(habit, date) {
            let status = entry_status(data, date, &habit.id);
            match status {
                EntryStatus::Done => {
                    streak += 1;
                    if last_completed.is_none() {
                        last_completed = Some(date);
                    }
                }
                EntryStatus::Skipped => {
                    // Freeze: preserve streak, do not grow it.
                }
                EntryStatus::Pending => {
                    if date == today {
                        // Today still in play.
                    } else {
                        break;
                    }
                }
            }
        }
        // Step back one day.
        match date.pred_opt() {
            Some(d) => date = d,
            None => break,
        }
    }

    (streak, last_completed)
}

fn entry_status(data: &AppData, date: NaiveDate, habit_id: &str) -> EntryStatus {
    let key = date.to_string();
    let Some(day) = data.days.get(&key) else {
        return EntryStatus::Pending;
    };
    if day.skipped_whole_day {
        return EntryStatus::Skipped;
    }
    day.entries
        .iter()
        .find(|e| e.habit_id == habit_id)
        .map(|e| e.status)
        .unwrap_or(EntryStatus::Pending)
}

/// Update `data.streaks[habit_id]` for the given habit.
pub fn recompute_habit_streak(data: &mut AppData, habit_id: &str, today: NaiveDate) {
    let Some(habit) = data.habits.iter().find(|h| h.id == habit_id).cloned() else {
        return;
    };
    let (current, last_completed) = compute_habit_streak(data, &habit, today);
    let existing = data.streaks.entry(habit_id.to_string()).or_default();
    let longest = existing.longest.max(current);
    let frozen_by_date = existing.frozen_by_date;
    *existing = Streak {
        current,
        longest,
        last_completed_date: last_completed,
        frozen_by_date,
    };
}

/// Recompute streaks for every habit. Used after global changes (import,
/// archive). For point edits, use `recompute_habit_streak`.
pub fn recompute_all_streaks(data: &mut AppData, today: NaiveDate) {
    let ids: Vec<String> = data.habits.iter().map(|h| h.id.clone()).collect();
    for id in ids {
        recompute_habit_streak(data, &id, today);
    }
    recompute_perfect_day_streak(data, today);
}

pub fn recompute_perfect_day_streak(data: &mut AppData, today: NaiveDate) {
    let mut date = today;
    let mut streak = 0u32;
    let mut last_perfect: Option<NaiveDate> = None;

    loop {
        let view = day_engine::build_day_view(data, date);
        match view.day_status {
            DayStatus::Perfect | DayStatus::Skipped => {
                streak += 1;
                if last_perfect.is_none() {
                    last_perfect = Some(date);
                }
            }
            DayStatus::Empty => {
                // No expected habits this day — neutral, keep walking.
            }
            DayStatus::Partial => {
                if date == today {
                    // Don't break today's potential.
                } else {
                    break;
                }
            }
        }
        match date.pred_opt() {
            Some(d) => date = d,
            None => break,
        }
        // Don't walk past the earliest known data.
        if data.habits.iter().all(|h| date < h.start_date) {
            break;
        }
    }

    let longest = data.perfect_day_streak.longest.max(streak);
    data.perfect_day_streak.current = streak;
    data.perfect_day_streak.longest = longest;
    data.perfect_day_streak.last_perfect_date = last_perfect;
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{NaiveDate, Utc};

    use crate::model::{
        AppData, CounterConfig, Day, DayEntry, EntryStatus, Frequency, FrequencyPreset, GoalPreset,
        Habit, HabitKind, Weekday,
    };

    fn make_habit(start: NaiveDate, freq: Frequency) -> Habit {
        Habit {
            id: "h".into(),
            title: "t".into(),
            section_id: "morning".into(),
            kind: HabitKind::Checkbox,
            counter: None,
            frequency: freq,
            start_date: start,
            end_date: None,
            goal_preset: GoalPreset::Indefinite,
            order: 0,
            archived: false,
            completed: false,
            completed_at: None,
            created_at: Utc::now(),
        }
    }

    fn set_status(data: &mut AppData, date: NaiveDate, habit_id: &str, status: EntryStatus) {
        let day = data.days.entry(date.to_string()).or_insert_with(|| Day {
            entries: Vec::new(),
            day_status: DayStatus::Empty,
            skipped_whole_day: false,
        });
        if let Some(e) = day.entries.iter_mut().find(|e| e.habit_id == habit_id) {
            e.status = status;
        } else {
            day.entries.push(DayEntry {
                habit_id: habit_id.into(),
                status,
                counter_current: None,
                completed_at: None,
            });
        }
    }

    fn daily_habit(start: NaiveDate) -> Habit {
        make_habit(
            start,
            Frequency::ByDays {
                days: vec![
                    Weekday::Mon,
                    Weekday::Tue,
                    Weekday::Wed,
                    Weekday::Thu,
                    Weekday::Fri,
                    Weekday::Sat,
                    Weekday::Sun,
                ],
                preset: FrequencyPreset::All,
            },
        )
    }

    #[test]
    fn five_days_in_a_row_makes_streak_five() {
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
        let mut data = AppData::default();
        data.habits.push(daily_habit(start));

        for offset in 0..5 {
            let d = start + chrono::Duration::days(offset);
            set_status(&mut data, d, "h", EntryStatus::Done);
        }
        let today = start + chrono::Duration::days(4);
        let (current, _) = compute_habit_streak(&data, &data.habits[0].clone(), today);
        assert_eq!(current, 5);
    }

    #[test]
    fn pending_day_in_the_middle_breaks_streak() {
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
        let mut data = AppData::default();
        data.habits.push(daily_habit(start));
        // 3 done, 1 missed (no entry → Pending), then 1 done.
        for offset in [0, 1, 2, 4] {
            let d = start + chrono::Duration::days(offset);
            set_status(&mut data, d, "h", EntryStatus::Done);
        }
        let today = start + chrono::Duration::days(4);
        let (current, _) = compute_habit_streak(&data, &data.habits[0].clone(), today);
        assert_eq!(current, 1);
    }

    #[test]
    fn interval_three_three_times_makes_streak_three() {
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
        let mut data = AppData::default();
        data.habits
            .push(make_habit(start, Frequency::Interval { interval_days: 3 }));
        // Expected days: Jun 1, 4, 7.
        for d in [
            start,
            start + chrono::Duration::days(3),
            start + chrono::Duration::days(6),
        ] {
            set_status(&mut data, d, "h", EntryStatus::Done);
        }
        let today = start + chrono::Duration::days(6);
        let (current, _) = compute_habit_streak(&data, &data.habits[0].clone(), today);
        assert_eq!(current, 3);
    }

    #[test]
    fn unchecking_past_day_recomputes_to_one() {
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
        let mut data = AppData::default();
        data.habits.push(daily_habit(start));
        // 5 days done.
        for offset in 0..5 {
            set_status(
                &mut data,
                start + chrono::Duration::days(offset),
                "h",
                EntryStatus::Done,
            );
        }
        // Uncheck middle day (offset=2).
        set_status(
            &mut data,
            start + chrono::Duration::days(2),
            "h",
            EntryStatus::Pending,
        );
        let today = start + chrono::Duration::days(4);
        let (current, _) = compute_habit_streak(&data, &data.habits[0].clone(), today);
        // Only last 2 days are an unbroken Done run.
        assert_eq!(current, 2);
    }

    #[test]
    fn freeze_preserves_streak_without_growing() {
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
        let mut data = AppData::default();
        data.habits.push(daily_habit(start));
        // Done, Done, Skipped (freeze), Done.
        set_status(&mut data, start, "h", EntryStatus::Done);
        set_status(
            &mut data,
            start + chrono::Duration::days(1),
            "h",
            EntryStatus::Done,
        );
        set_status(
            &mut data,
            start + chrono::Duration::days(2),
            "h",
            EntryStatus::Skipped,
        );
        set_status(
            &mut data,
            start + chrono::Duration::days(3),
            "h",
            EntryStatus::Done,
        );
        let today = start + chrono::Duration::days(3);
        let (current, _) = compute_habit_streak(&data, &data.habits[0].clone(), today);
        // Streak counts only Done days (3), but the Skipped day didn't break the walk.
        assert_eq!(current, 3);
    }

    #[test]
    fn pending_today_does_not_break_streak() {
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
        let mut data = AppData::default();
        data.habits.push(daily_habit(start));
        // 3 days done; today (4th day) still pending.
        for offset in 0..3 {
            set_status(
                &mut data,
                start + chrono::Duration::days(offset),
                "h",
                EntryStatus::Done,
            );
        }
        let today = start + chrono::Duration::days(3);
        let (current, _) = compute_habit_streak(&data, &data.habits[0].clone(), today);
        assert_eq!(current, 3);
    }

    #[test]
    fn weekday_habit_skips_non_expected_days() {
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(); // Monday
        let mut data = AppData::default();
        let habit = make_habit(
            start,
            Frequency::ByDays {
                days: vec![Weekday::Mon, Weekday::Wed, Weekday::Fri],
                preset: FrequencyPreset::Custom,
            },
        );
        data.habits.push(habit);
        // Mark Mon Jun 1, Wed Jun 3, Fri Jun 5 done.
        for d in [
            start,
            start + chrono::Duration::days(2),
            start + chrono::Duration::days(4),
        ] {
            set_status(&mut data, d, "h", EntryStatus::Done);
        }
        let today = start + chrono::Duration::days(4); // Fri
        let (current, _) = compute_habit_streak(&data, &data.habits[0].clone(), today);
        assert_eq!(current, 3);
    }

    #[test]
    fn longest_grows_monotonically() {
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
        let mut data = AppData::default();
        data.habits.push(daily_habit(start));
        // 4 in a row.
        for offset in 0..4 {
            set_status(
                &mut data,
                start + chrono::Duration::days(offset),
                "h",
                EntryStatus::Done,
            );
        }
        let today = start + chrono::Duration::days(3);
        recompute_habit_streak(&mut data, "h", today);
        assert_eq!(data.streaks.get("h").unwrap().longest, 4);
        // Break the streak.
        set_status(
            &mut data,
            start + chrono::Duration::days(3),
            "h",
            EntryStatus::Pending,
        );
        recompute_habit_streak(&mut data, "h", today);
        // Current resets to 0 (today pending → no break, but walk ends at day-2),
        // and from offset 0..2 we have 3 consecutive Done. So current = 0
        // (today pending, then offset 2 is the last seen, etc.)
        // Important assertion: longest stayed at 4.
        assert_eq!(data.streaks.get("h").unwrap().longest, 4);
    }

    #[test]
    fn perfect_day_streak_counts_consecutive_perfect_days() {
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
        let mut data = AppData::default();
        data.habits.push(daily_habit(start));
        // Mark days 0,1,2 done. Day 3 only partial.
        for offset in 0..3 {
            set_status(
                &mut data,
                start + chrono::Duration::days(offset),
                "h",
                EntryStatus::Done,
            );
        }
        recompute_perfect_day_streak(&mut data, start + chrono::Duration::days(2));
        assert_eq!(data.perfect_day_streak.current, 3);
        assert_eq!(data.perfect_day_streak.longest, 3);
    }

    #[test]
    fn perfect_day_streak_today_pending_does_not_break() {
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
        let mut data = AppData::default();
        data.habits.push(daily_habit(start));
        for offset in 0..3 {
            set_status(
                &mut data,
                start + chrono::Duration::days(offset),
                "h",
                EntryStatus::Done,
            );
        }
        // Today is day 3, not yet marked.
        recompute_perfect_day_streak(&mut data, start + chrono::Duration::days(3));
        assert_eq!(data.perfect_day_streak.current, 3);
    }

    #[test]
    fn counter_reaching_target_completes_for_streak() {
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
        let mut data = AppData::default();
        let counter_habit = Habit {
            id: "c".into(),
            title: "water".into(),
            section_id: "morning".into(),
            kind: HabitKind::Counter,
            counter: Some(CounterConfig {
                target: 2.0,
                unit: "l".into(),
                steps: vec![0.2],
            }),
            frequency: Frequency::ByDays {
                days: vec![Weekday::Mon, Weekday::Tue, Weekday::Wed],
                preset: FrequencyPreset::Custom,
            },
            start_date: start,
            end_date: None,
            goal_preset: GoalPreset::Indefinite,
            order: 0,
            archived: false,
            completed: false,
            completed_at: None,
            created_at: Utc::now(),
        };
        data.habits.push(counter_habit);
        // Day 0 and day 1: counter reached target (status Done).
        for offset in 0..2 {
            let d = start + chrono::Duration::days(offset);
            let day = data.days.entry(d.to_string()).or_insert_with(|| Day {
                entries: Vec::new(),
                day_status: DayStatus::Empty,
                skipped_whole_day: false,
            });
            day.entries.push(DayEntry {
                habit_id: "c".into(),
                status: EntryStatus::Done,
                counter_current: Some(2.0),
                completed_at: None,
            });
        }
        let today = start + chrono::Duration::days(1);
        let (current, _) = compute_habit_streak(&data, &data.habits[0].clone(), today);
        assert_eq!(current, 2);
    }

    // ------------------------------------------------------------------
    // Retroactive editing (Phase 10)
    // ------------------------------------------------------------------

    #[test]
    fn retroactive_filling_a_gap_restores_full_streak() {
        // Day 0..4 done, day 2 pending (a gap) → current streak = 2.
        // Then user retroactively marks day 2 done → streak should become 5.
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
        let mut data = AppData::default();
        data.habits.push(daily_habit(start));
        for offset in [0, 1, 3, 4] {
            set_status(
                &mut data,
                start + chrono::Duration::days(offset),
                "h",
                EntryStatus::Done,
            );
        }
        let today = start + chrono::Duration::days(4);
        recompute_habit_streak(&mut data, "h", today);
        assert_eq!(
            data.streaks.get("h").unwrap().current,
            2,
            "gap breaks the walk"
        );

        // Retroactively mark day 2 as Done.
        set_status(
            &mut data,
            start + chrono::Duration::days(2),
            "h",
            EntryStatus::Done,
        );
        recompute_habit_streak(&mut data, "h", today);
        let s = data.streaks.get("h").unwrap();
        assert_eq!(
            s.current, 5,
            "filling the gap should restore the full streak"
        );
        assert_eq!(s.longest, 5, "longest must catch up to the new current");
    }

    #[test]
    fn retroactive_unchecking_yesterday_shrinks_streak() {
        // 5 days Done → current = 5. Then user unchecks yesterday (day 3
        // counting from start, since today is day 4). Current must drop.
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
        let mut data = AppData::default();
        data.habits.push(daily_habit(start));
        for offset in 0..5 {
            set_status(
                &mut data,
                start + chrono::Duration::days(offset),
                "h",
                EntryStatus::Done,
            );
        }
        let today = start + chrono::Duration::days(4);
        recompute_habit_streak(&mut data, "h", today);
        assert_eq!(data.streaks.get("h").unwrap().current, 5);

        // Uncheck yesterday.
        let yesterday = today - chrono::Duration::days(1);
        set_status(&mut data, yesterday, "h", EntryStatus::Pending);
        recompute_habit_streak(&mut data, "h", today);
        let s = data.streaks.get("h").unwrap();
        // Today is still Done (1) → walk continues, yesterday Pending breaks it.
        assert_eq!(s.current, 1, "unchecking yesterday breaks at day-1");
        assert_eq!(s.longest, 5, "longest never shrinks");
    }

    #[test]
    fn retroactive_chain_of_edits_stays_consistent() {
        // Scenario:
        //   start: 7 days, [D, D, D, P, D, D, D] → current=3 (last 3 done)
        //   edit A: mark day 3 as Done → expect current=7
        //   edit B: uncheck day 0 → expect current=7 (still unbroken from 1..6)
        //   edit C: freeze day 4 → expect current=6 (Skipped preserves walk)
        //   edit D: uncheck day 5 → expect current=2 (day 6 Done + day 5 broken)
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
        let mut data = AppData::default();
        data.habits.push(daily_habit(start));
        for offset in [0, 1, 2, 4, 5, 6] {
            set_status(
                &mut data,
                start + chrono::Duration::days(offset),
                "h",
                EntryStatus::Done,
            );
        }
        let today = start + chrono::Duration::days(6);
        recompute_habit_streak(&mut data, "h", today);
        assert_eq!(
            data.streaks.get("h").unwrap().current,
            3,
            "initial gap at day 3"
        );

        // A: fill the gap.
        set_status(
            &mut data,
            start + chrono::Duration::days(3),
            "h",
            EntryStatus::Done,
        );
        recompute_habit_streak(&mut data, "h", today);
        assert_eq!(data.streaks.get("h").unwrap().current, 7);

        // B: uncheck the earliest day — does not touch the recent run.
        set_status(&mut data, start, "h", EntryStatus::Pending);
        recompute_habit_streak(&mut data, "h", today);
        assert_eq!(data.streaks.get("h").unwrap().current, 6);

        // C: freeze day 4 — Skipped preserves the walk but doesn't grow it.
        set_status(
            &mut data,
            start + chrono::Duration::days(4),
            "h",
            EntryStatus::Skipped,
        );
        recompute_habit_streak(&mut data, "h", today);
        // Done at days 1,2,3,5,6 (5 Done) — freeze day 4 doesn't add to count.
        assert_eq!(data.streaks.get("h").unwrap().current, 5);

        // D: uncheck day 5 — breaks the walk between day 5 and day 6.
        set_status(
            &mut data,
            start + chrono::Duration::days(5),
            "h",
            EntryStatus::Pending,
        );
        recompute_habit_streak(&mut data, "h", today);
        // Only day 6 (Done) is left before walk breaks at day 5.
        assert_eq!(data.streaks.get("h").unwrap().current, 1);
        // Longest must remain at the historical peak of 7.
        assert_eq!(data.streaks.get("h").unwrap().longest, 7);
    }

    #[test]
    fn retroactive_perfect_day_streak_after_filling_gap() {
        // Two daily habits. Days 0,1,2,4 are fully done, day 3 has a pending
        // entry on one habit (so it's only Partial). Perfect-day current = 1
        // (only today, day 4). After filling the gap on day 3, perfect-day
        // current must jump to 5.
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
        let mut data = AppData::default();
        let mut a = daily_habit(start);
        a.id = "a".into();
        let mut b = daily_habit(start);
        b.id = "b".into();
        data.habits.push(a);
        data.habits.push(b);

        for offset in 0..5 {
            let d = start + chrono::Duration::days(offset);
            set_status(&mut data, d, "a", EntryStatus::Done);
            if offset != 3 {
                set_status(&mut data, d, "b", EntryStatus::Done);
            } else {
                // Day 3: "b" stays Pending → day is Partial.
                set_status(&mut data, d, "b", EntryStatus::Pending);
            }
        }
        let today = start + chrono::Duration::days(4);
        // Force day_status to be cached correctly.
        for offset in 0..5 {
            crate::day_engine::recompute_day_status(
                &mut data,
                start + chrono::Duration::days(offset),
            );
        }

        recompute_perfect_day_streak(&mut data, today);
        assert_eq!(
            data.perfect_day_streak.current, 1,
            "today is Perfect, day 3 Partial breaks the walk",
        );

        // Retroactively fill the gap on day 3.
        set_status(
            &mut data,
            start + chrono::Duration::days(3),
            "b",
            EntryStatus::Done,
        );
        crate::day_engine::recompute_day_status(&mut data, start + chrono::Duration::days(3));
        recompute_perfect_day_streak(&mut data, today);
        assert_eq!(
            data.perfect_day_streak.current, 5,
            "filling the gap restores the full perfect-day streak",
        );
        assert_eq!(data.perfect_day_streak.longest, 5);
    }

    #[test]
    fn retroactive_counter_drop_below_target_breaks_streak() {
        // Counter habit, daily, target 2.0. Days 0..2 all reached target →
        // streak = 3. Then user retroactively drops day 1's counter to 0.5 →
        // status flips back to Pending → walk breaks at day 1, current = 1.
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
        let mut data = AppData::default();
        let counter_habit = Habit {
            id: "c".into(),
            title: "water".into(),
            section_id: "morning".into(),
            kind: HabitKind::Counter,
            counter: Some(CounterConfig {
                target: 2.0,
                unit: "l".into(),
                steps: vec![0.5],
            }),
            frequency: Frequency::ByDays {
                days: vec![
                    Weekday::Mon,
                    Weekday::Tue,
                    Weekday::Wed,
                    Weekday::Thu,
                    Weekday::Fri,
                    Weekday::Sat,
                    Weekday::Sun,
                ],
                preset: FrequencyPreset::All,
            },
            start_date: start,
            end_date: None,
            goal_preset: GoalPreset::Indefinite,
            order: 0,
            archived: false,
            completed: false,
            completed_at: None,
            created_at: Utc::now(),
        };
        data.habits.push(counter_habit);

        // Fill 3 days with target met.
        for offset in 0..3 {
            let d = start + chrono::Duration::days(offset);
            let day = data.days.entry(d.to_string()).or_insert_with(|| Day {
                entries: Vec::new(),
                day_status: DayStatus::Empty,
                skipped_whole_day: false,
            });
            day.entries.push(DayEntry {
                habit_id: "c".into(),
                status: EntryStatus::Done,
                counter_current: Some(2.0),
                completed_at: None,
            });
        }
        let today = start + chrono::Duration::days(2);
        recompute_habit_streak(&mut data, "c", today);
        assert_eq!(data.streaks.get("c").unwrap().current, 3);

        // Retroactively drop day 1's counter below the target.
        let mid = start + chrono::Duration::days(1);
        let day = data.days.get_mut(&mid.to_string()).unwrap();
        let entry = day.entries.iter_mut().find(|e| e.habit_id == "c").unwrap();
        entry.counter_current = Some(0.5);
        entry.status = EntryStatus::Pending;
        entry.completed_at = None;

        recompute_habit_streak(&mut data, "c", today);
        let s = data.streaks.get("c").unwrap();
        // Walk: today (Done, +1) → step back to day 1 (Pending past) → break.
        assert_eq!(
            s.current, 1,
            "counter dropped below target breaks the past walk"
        );
        assert_eq!(s.longest, 3, "longest stays at historical peak");
    }

    #[test]
    fn retroactive_freeze_in_past_keeps_walk_alive() {
        // 5 daily habit-days, but day 2 is Pending (missed). Without help,
        // current=2 (only days 3..4 in a row before walk hits the Pending).
        // After retroactively freezing day 2, walk continues across it, so
        // current must become 4 (Done on 0,1,3,4 — freeze preserves but
        // doesn't grow).
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
        let mut data = AppData::default();
        data.habits.push(daily_habit(start));
        for offset in [0, 1, 3, 4] {
            set_status(
                &mut data,
                start + chrono::Duration::days(offset),
                "h",
                EntryStatus::Done,
            );
        }
        let today = start + chrono::Duration::days(4);
        recompute_habit_streak(&mut data, "h", today);
        assert_eq!(
            data.streaks.get("h").unwrap().current,
            2,
            "gap breaks the walk"
        );

        // Retroactively freeze day 2.
        set_status(
            &mut data,
            start + chrono::Duration::days(2),
            "h",
            EntryStatus::Skipped,
        );
        recompute_habit_streak(&mut data, "h", today);
        let s = data.streaks.get("h").unwrap();
        assert_eq!(
            s.current, 4,
            "freeze preserves the walk → all 4 Done days count"
        );
        assert_eq!(s.longest, 4);
    }
}
