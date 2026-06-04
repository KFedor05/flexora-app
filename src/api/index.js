/**
 * Thin async wrapper around Tauri commands. No UI here — just types and
 * argument shaping. Every function returns a Promise that resolves to the
 * Rust-side return type, or rejects with a plain error message string.
 *
 * @typedef {"checkbox" | "counter"} HabitKind
 * @typedef {"mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"} Weekday
 * @typedef {"all"|"weekdays"|"weekends"|"custom"} FrequencyPreset
 * @typedef {"indefinite"|"7d"|"30d"|"100d"|"365d"|"custom"} GoalPreset
 * @typedef {"system"|"light"|"dark"} ThemeChoice
 *
 * @typedef {{ target: number, unit: string, steps: number[] }} CounterConfig
 * @typedef {{ type: "byDays", days: Weekday[], preset: FrequencyPreset } | { type: "interval", intervalDays: number }} Frequency
 *
 * @typedef {{
 *   id: string,
 *   title: string,
 *   sectionId: string,
 *   type: HabitKind,
 *   counter?: CounterConfig | null,
 *   frequency: Frequency,
 *   startDate: string,
 *   endDate: string | null,
 *   goalPreset: GoalPreset,
 *   order: number,
 *   archived: boolean,
 *   completed: boolean,
 *   completedAt: string | null,
 *   createdAt: string,
 * }} Habit
 *
 * @typedef {{ id: string, name: string, order: number, isDefault: boolean }} Section
 *
 * @typedef {{
 *   theme: ThemeChoice,
 *   language: string,
 *   autoStart: boolean,
 *   minimizeToTray: boolean,
 *   openToToday: boolean,
 *   firstLaunchDone: boolean,
 * }} Settings
 *
 * @typedef {{
 *   schemaVersion: number,
 *   habits: Habit[],
 *   sections: Section[],
 *   days: Record<string, unknown>,
 *   streaks: Record<string, unknown>,
 *   perfectDayStreak: unknown,
 *   settings: Settings,
 * }} AppData
 */

import { invoke } from "@tauri-apps/api/core";

/** @returns {Promise<AppData>} */
export const loadAppData = () => invoke("load_app_data");

/**
 * @param {Omit<Habit, "id"|"order"|"archived"|"completed"|"completedAt"|"createdAt">} input
 * @returns {Promise<Habit>}
 */
export const createHabit = (input) => invoke("create_habit", { input });

/**
 * Partial update. Pass only the fields you want to change.
 * `endDate` is a double-option: pass `null` to clear, omit to leave unchanged.
 * @param {string} id
 * @param {Partial<Pick<Habit,"title"|"sectionId"|"counter"|"frequency"|"endDate"|"goalPreset"|"order">>} patch
 * @returns {Promise<Habit>}
 */
export const updateHabit = (id, patch) => invoke("update_habit", { id, patch });

/** @param {string} id @returns {Promise<void>} */
export const archiveHabit = (id) => invoke("archive_habit", { id });

/** @param {string} id @returns {Promise<Habit>} */
export const completeHabit = (id) => invoke("complete_habit", { id });

/** @param {string} name @returns {Promise<Section>} */
export const createSection = (name) => invoke("create_section", { name });

/**
 * @param {string} id
 * @param {{ name?: string, order?: number }} patch
 * @returns {Promise<Section>}
 */
export const updateSection = (id, patch) => invoke("update_section", { id, ...patch });

/**
 * Default sections cannot be deleted. Habits in the deleted section are
 * moved to `moveTo`.
 * @param {string} id
 * @param {string} moveTo
 * @returns {Promise<void>}
 */
export const deleteSection = (id, moveTo) => invoke("delete_section", { id, moveTo });

/** @returns {Promise<Settings>} */
export const getSettings = () => invoke("get_settings");

/**
 * @param {Partial<Settings>} patch
 * @returns {Promise<Settings>}
 */
export const updateSettings = (patch) => invoke("update_settings", { patch });

/**
 * @typedef {{ done: number, skipped: number, total: number }} DayProgress
 * @typedef {{ habitId: string, status: "done"|"pending"|"skipped", counterCurrent?: number, completedAt: string | null }} DayEntryView
 * @typedef {{ current: number, longest: number, lastCompletedDate: string | null, frozenByDate: string | null }} StreakInfo
 * @typedef {{ current: number, longest: number, lastPerfectDate: string | null }} PerfectDayStreak
 * @typedef {{
 *   date: string,
 *   entries: DayEntryView[],
 *   dayStatus: "perfect"|"partial"|"empty"|"skipped",
 *   skippedWholeDay: boolean,
 *   progress: DayProgress,
 *   habitStreaks: Record<string, StreakInfo>,
 *   perfectDayStreak: PerfectDayStreak,
 * }} DayView
 */

/** @param {string} date YYYY-MM-DD @returns {Promise<DayView>} */
export const getDay = (date) => invoke("get_day", { date });

/** @param {string} date @param {string} habitId @returns {Promise<DayView>} */
export const toggleEntry = (date, habitId) => invoke("toggle_entry", { date, habitId });

/** @param {string} date @param {string} habitId @param {number} value @returns {Promise<DayView>} */
export const setEntryCounter = (date, habitId, value) =>
  invoke("set_entry_counter", { date, habitId, value });

/** @param {string} date @param {string} habitId @returns {Promise<DayView>} */
export const toggleFreezeEntry = (date, habitId) =>
  invoke("toggle_freeze_entry", { date, habitId });

/** @param {string} date @returns {Promise<DayView>} */
export const toggleSkipDay = (date) => invoke("toggle_skip_day", { date });

/**
 * Per-day summary for an entire month, used by the calendar grid.
 * @typedef {{
 *   date: string,
 *   dayStatus: "perfect"|"partial"|"empty"|"skipped",
 *   done: number,
 *   skipped: number,
 *   total: number,
 *   skippedWholeDay: boolean,
 * }} DayBrief
 *
 * @param {number} year @param {number} month 1-12 @returns {Promise<DayBrief[]>}
 */
export const getMonth = (year, month) => invoke("get_month", { year, month });

/**
 * Aggregated month-level stats for a single year.
 * @typedef {{ year: number, month: number, green: number, orange: number, red: number }} MonthBrief
 * @param {number} year @returns {Promise<MonthBrief[]>}
 */
export const getYear = (year) => invoke("get_year", { year });

/** Distinct years with stored data, plus the current year. @returns {Promise<number[]>} */
export const getYears = () => invoke("get_years");

/** Server-side "today" in local time. @returns {Promise<string>} */
export const todayIso = () => invoke("today_iso");

/** Package version from Cargo.toml. @returns {Promise<string>} */
export const appVersion = () => invoke("app_version");

/** Absolute path to the directory where `data.json` lives. @returns {Promise<string>} */
export const dataDir = () => invoke("data_dir");

/**
 * Serialize current AppData to the given absolute path. Used for "Export".
 * @param {string} path
 * @returns {Promise<void>}
 */
export const exportToPath = (path) => invoke("export_to_path", { path });

/**
 * Load + validate + replace state from the JSON file at `path`. Streaks
 * are recomputed against the imported data.
 * @param {string} path
 * @returns {Promise<AppData>}
 */
export const importFromPath = (path) => invoke("import_from_path", { path });
