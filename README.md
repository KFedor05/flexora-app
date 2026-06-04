<h1 align="center">
  <img src="public/logo.png" width="96" alt="Flexora logo" /><br/>
  Flexora
</h1>

<p align="center">
  A cross-platform desktop habit tracker with streaks, per-weekday templates, and a calendar view.
</p>

<p align="center">
  <a href="https://github.com/KFedor05/flexora-app/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/KFedor05/flexora-app/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/KFedor05/flexora-app/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/KFedor05/flexora-app?include_prereleases&sort=semver" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/KFedor05/flexora-app" /></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue" />
</p>

---

Flexora is a desktop app for building daily routines. Unlike most habit trackers, it treats
each weekday as its own template — so "go to the gym Mon/Wed/Fri" and "read every evening" can
live side by side without polluting each other's stats. Streaks understand that, freezes let
you intentionally skip a day without breaking the chain, and a calendar lets you go back and
fix the past when you forgot to log something.

Everything is stored locally as a single JSON file. No accounts, no cloud, no telemetry.

## Features

- **Per-weekday templates** — different lists for Mon, Tue, Wed... or a flat single list, your choice
- **Frequency-aware streaks** — daily, weekly, every-N-days, custom weekdays
- **Perfect-day streak** — counts days you completed everything scheduled
- **Counters** — habits with a numeric target (e.g. "8 glasses of water"), tracked in the right panel
- **Freezes & skip-days** — protect a streak without lying to yourself
- **Calendar / month / year navigation** — browse history Notion-style
- **Retroactive editing** — fix yesterday, last week, last month; streaks recompute automatically
- **Dark / light / system theme** with live OS-preference detection
- **English & Russian** with proper plural forms
- **Export & import** — backup and restore your data as JSON
- **System tray, autostart, single-instance** — behaves like a proper desktop app

## Screenshots

<!-- TODO: replace with actual screenshots once they're added under docs/screenshots/ -->

> Screenshots will land here before v1.0.0 ships. For now, the [`mockup/`](mockup/) folder contains
> design-phase HTML mockups of every screen — open any `.html` in a browser to get a feel for the UI.

## Download

Grab the latest installer for your platform from the
[**Releases**](https://github.com/KFedor05/flexora-app/releases/latest) page.

| Platform      | File                                           | Notes                                                                                                          |
| ------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Windows 10/11 | `Flexora_x.y.z_x64-setup.exe` (NSIS) or `.msi` | SmartScreen may warn on first launch — click **More info → Run anyway**. The build is not code-signed in v1.0. |
| macOS 12+     | `Flexora_x.y.z_universal.dmg`                  | Universal binary (Apple Silicon + Intel). Right-click → Open the first time, since the build is not notarised. |
| Linux         | `Flexora_x.y.z_amd64.AppImage` or `.deb`       | AppImage is portable, `.deb` is for Debian/Ubuntu.                                                             |

Your data lives in:

- Windows: `%APPDATA%\com.flexora.app\data.json`
- macOS: `~/Library/Application Support/com.flexora.app/data.json`
- Linux: `~/.local/share/com.flexora.app/data.json`

## Run from source

Prerequisites:

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 20+
- Platform-specific Tauri prerequisites — see
  [Tauri's prerequisites guide](https://v2.tauri.app/start/prerequisites/)

```bash
git clone https://github.com/KFedor05/flexora-app
cd flexora-app
npm install
npm run tauri:dev
```

To produce installers locally:

```bash
npm run tauri:build
```

The output lands in `src-tauri/target/release/bundle/`.

## Tech stack

- **[Tauri 2.x](https://tauri.app/)** — Rust-backed desktop shell, ~3 MB binaries
- **Rust** — backend (data model, streaks, atomic storage, validation)
- **Vanilla JavaScript + ES modules** — frontend, no framework
- **[Tailwind CSS v4](https://tailwindcss.com/)** — styling
- **[Vite](https://vitejs.dev/)** — dev server and build
- **[i18next](https://www.i18next.com/)** — translations (en/ru)
- **[Lucide](https://lucide.dev/)** + **[Sortable.js](https://github.com/SortableJS/Sortable)** — icons and drag-drop

## Privacy

- All data is stored **locally** in a single JSON file on your machine
- **No accounts**, **no cloud sync**, **no telemetry**, **no analytics**
- The only network requests are when the system browser opens a link you click yourself
- Source code is open — search this repo for `fetch(` or `http` and you'll find nothing

## Contributing

PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style,
and the PR process.

## License

[MIT](LICENSE) © Flexora contributors
