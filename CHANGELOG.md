# Changelog

All notable changes to Flexora are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.6] - 2026-06-04

### Fixed

- **Drag-drop on Windows:** habit / counter / section drag was broken on
  Windows in 1.0.5 because SortableJS defaults to the native HTML5 drag
  API, which doesn't behave reliably in WebView2 (especially for
  cross-list moves via the `group` option — captured items would darken
  but never move). Switched every Sortable instance to its pointer-based
  fallback (`forceFallback: true` + `fallbackOnBody` for cross-list ones),
  so drag now behaves identically across Linux, Windows, and macOS.
- **"Mark as special day" no longer erases today's streak growth:**
  previously, marking a day as special promoted every habit's status to
  `Skipped` for streak purposes, so habits you'd already completed today
  stopped counting as Done and their streaks dropped by one. Now special
  day only freezes Pending / missing entries — already-Done entries keep
  growing the streak.

### Changed

- **GitHub release body now shows the actual changelog section** for the
  version being released, not a generic "see the changelog" pointer. CI
  extracts the matching block from `CHANGELOG.md` and substitutes it into
  the release description, with the download links rendered below.
- **CI Node bumped from 20 to 22 (LTS)** in both `ci.yml` and `release.yml`
  to clear the deprecation warnings GitHub Actions has been printing on
  Node 20 jobs.

## [1.0.5] - 2026-06-04

### Fixed

- **Completed habits / counters disappear from Today immediately:** pressing
  "Complete" now removes the habit (or counter) from the Today list and the
  right-hand counter panel on the same day it was completed, matching the
  Editor's behaviour. Past dates still show it with its history.
- **Day status no longer inflated by stale entries:** if a habit went
  inactive after a stored entry (completed, frequency narrowed, end-date
  passed), its entry used to keep counting toward `done` while no longer
  counting toward `total`, leaving the day stuck on "partial" even when
  every still-active habit was finished. Both the cached day status and the
  calendar tiles now ignore entries that don't belong to a currently active
  habit.
- **Streak pills now refresh after Complete / Create / Edit:** completing a
  habit, creating a new one, archiving, or changing a habit's frequency or
  end-date now triggers the same recompute that toggling an entry does, so
  the streak pill and perfect-day pill match reality without a reload.

### Added

- **Calendar legend:** the calendar modal now lists what each colour means
  (red / orange / green / empty / special-day star) plus a note that future
  days are inactive.
- **Confirm before completing:** clicking "Complete" in the habit / counter
  form now asks for confirmation, with copy explaining that past entries
  stay in history but the habit won't appear in Today or Editor anymore.

### Changed

- **Editor by-days view:** habits can now be dragged across sections (not
  just reordered within one), and counters are draggable in both the
  by-section and by-days views via their own dedicated list.

## [1.0.4] - 2026-06-04

### Changed

- **Editor:** counters no longer render under habit sections (`Morning`,
  `Day`, etc.) even though they still carry a `sectionId` for the backend.
  They appear in their own `Counters` block at the bottom of both
  "By section" and "By days" views. The by-days variant only shows counters
  whose frequency hits the chosen weekday.

## [1.0.3] - 2026-06-04

### Changed

- **Calendar verdict colours:** today only goes green the moment you finish
  the plan (or mark the whole day as skipped). The red / orange "you didn't
  do it" verdicts are deferred until the day actually ends — no shaming
  mid-day. Past empty days that had scheduled habits but zero progress now
  render red.
- **Calendar flame icon:** marks perfect days (today included), keeps a
  consistent warm fire colour regardless of cell verdict, so it pops on
  green cells instead of vanishing into the green background.
- **Today-perfect emphasis:** when today is green, the cell gets a green
  glow + green border instead of the neutral blue today emphasis.

### Added

- **Midnight auto-refresh:** at 00:00:01 the current view is remounted so
  yesterday's verdict colour materialises and Today rolls over to the new
  day without the user having to navigate. Reschedules itself every
  midnight; survives system sleep (fires on wake).

## [1.0.2] - 2026-06-04

### Changed

- **Today screen:** whole task row is clickable to toggle the entry, not
  just the small checkbox. The freeze star keeps its own click target and
  no longer double-fires the toggle.

## [1.0.1] - 2026-06-04

### Fixed

- **Calendar:** today's cell now stands out clearly from empty past/future
  days — adds a soft accent-blue tint, an accent border, and brighter day
  number, on top of the existing glow.

## [1.0.0] - 2026-06-04

First public release.

### Added

- **Habits with per-weekday templates** — flat list or by-weekday layout, switch per-section
- **Sections** — custom CRUD; built-in defaults can be renamed but not removed
- **Counters** — numeric targets, tracked in the right-hand panel on the Today view
- **Frequency-aware streaks** — daily, every-N-days, weekdays; current + longest both tracked
- **Perfect-day streak** — counts consecutive days where every scheduled habit was completed
- **Freezes (star)** — pause a single habit's streak for one day without breaking it
- **Skip-day** — mark a whole day as intentionally off (vacation, sick); doesn't count as failure
- **Calendar view** — Notion-style month/year navigation with day previews
- **Days / Months / Years listing** — flat reverse-chronological browse
- **Retroactive editing** — change any past day; streaks and perfect-day status recompute
- **Themes** — System / Light / Dark with live `prefers-color-scheme` detection
- **Localisation** — English and Russian, including proper plural forms
- **Export / Import** — round-trip your data as a single JSON file with schema-version check
- **Settings** — autostart, minimize-to-tray, open-to-today behaviour toggles
- **System tray** — click to show/hide; window-state persisted between launches
- **Single-instance enforcement** — second launch focuses the existing window
- **Custom titlebar** with native minimize / maximize / close controls
- **Atomic storage** — tmp → fsync → rename writes plus rolling backup
- **Built-in app icon** — custom F-flame monogram in warm amber on dark slate squircle

### Tech

- Tauri 2.11 + Rust 1.96 + Vanilla JS (ES modules) + Tailwind CSS v4 + Vite
- 26 Rust unit tests covering streaks, day status, retroactive recompute
- GitHub Actions CI on every push: ESLint, Prettier check, `cargo fmt --check`,
  `cargo clippy -D warnings`, `cargo test`
- GitHub Actions release pipeline builds `.exe` / `.dmg` / `.AppImage` from a tag

[Unreleased]: https://github.com/KFedor05/flexora-app/compare/v1.0.4...HEAD
[1.0.4]: https://github.com/KFedor05/flexora-app/releases/tag/v1.0.4
[1.0.3]: https://github.com/KFedor05/flexora-app/releases/tag/v1.0.3
[1.0.2]: https://github.com/KFedor05/flexora-app/releases/tag/v1.0.2
[1.0.1]: https://github.com/KFedor05/flexora-app/releases/tag/v1.0.1
[1.0.0]: https://github.com/KFedor05/flexora-app/releases/tag/v1.0.0
