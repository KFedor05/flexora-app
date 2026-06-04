# Contributing to Flexora

Thanks for taking the time to look. PRs are welcome — bug fixes, small features, docs improvements,
translations. For anything larger than a one-screen change, open an issue first so we can agree
on the shape of it before you spend hours.

## Setup

Prerequisites:

- [Rust](https://rustup.rs/) (stable toolchain — `rustup default stable`)
- [Node.js](https://nodejs.org/) 20+
- Platform-specific Tauri prereqs — follow
  [Tauri's prerequisites guide](https://v2.tauri.app/start/prerequisites/) for your OS

```bash
git clone https://github.com/KFedor05/flexora-app
cd flexora-app
npm install
npm run tauri:dev
```

The window should open within a minute (first run includes a one-off Rust compile of ~3 min).

> WSL2 users: the WebKit renderer needs a few environment variables to show a window.
> See the `WSLg env vars` section at the bottom.

## Project layout

```
src/                  Vanilla JS frontend (ES modules)
  api/                Thin async wrapper around Tauri commands
  ui/                 Views, modals, router
  ui/forms/           Habit + counter form
  i18n/, locales/     English + Russian translations
src-tauri/src/        Rust backend
  model.rs            Data shape (habits, counters, sections, days)
  storage.rs          Atomic JSON write + rolling backup
  state.rs            In-memory state behind a mutex
  commands.rs         #[tauri::command] surface — what JS calls
  day_engine.rs       get_day, toggle_entry, set_entry_counter, day status
  streaks.rs          Frequency-aware streak math + perfect-day streak
  validate.rs         Input validators
  errors.rs           AppError + JS-side error shape
  lib.rs              Tauri setup, tray, plugins
mockup/               Static HTML/CSS mockups (the design-phase artefacts)
public/               Static assets served by Vite (currently just logo.png)
.github/workflows/    CI + release pipelines
PLAN.md, PHASES.md    Original design + roadmap docs
```

## Code style

The project uses ESLint, Prettier (frontend) and rustfmt + clippy (backend). CI fails on any
formatting drift or clippy warning, so run these before committing:

```bash
# Frontend
npm run lint
npm run format            # writes
npm run format:check      # just verifies

# Backend
cargo fmt --all --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

A pre-commit hook is not enforced — the convention is "run before you push, don't rely on CI to
catch trivial style issues".

### Style decisions worth knowing

- 2-space indentation, double quotes, semicolons, trailing commas, 100-char width
  (codified in `.prettierrc.json` and `rustfmt`'s defaults)
- Vanilla JS only — no React/Vue/etc. Keep the dependency tree small
- No build-time CSS preprocessing; Tailwind handles it
- Underscore-prefix (`_name`, `_`) marks intentionally unused vars and args

## Testing

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

26 Rust unit tests live alongside the modules they cover (`day_engine.rs`, `streaks.rs`).
Most of the streak edge-cases — retroactive edits, freezes, weekday-aware habits — are covered.

Frontend tests are intentionally not set up yet; the UI is small enough that manual smoke-testing
in `npm run tauri:dev` is the workflow.

## Commits

Conventional Commits, loosely:

- `feat:` user-visible new feature
- `fix:` user-visible bug fix
- `style:` formatting, no behaviour change
- `refactor:` internal rewrite, no behaviour change
- `docs:` README/CHANGELOG/comments
- `ci:` GitHub Actions / pipelines
- `build:` dependencies, build scripts
- `test:` test-only changes
- `chore:` everything else

One logical change per commit. The history reads cleaner that way and bisecting is easier.

## Pull requests

1. Open an issue first for anything bigger than a small bug fix
2. Fork → branch from `main` → PR back to `main`
3. Use the PR template (it autoloads); fill the testing checklist
4. CI must be green before merge
5. Reviews are squash-merged by default

## Translations

Locales live in `src/locales/en.json` and `src/locales/ru.json`. The JSON shapes are identical;
the Russian file has plural forms (`_zero`, `_one`, `_few`, `_many`, `_other`) where English doesn't.

To add a new language:

1. Copy `en.json` to `<lang>.json` next to it
2. Translate values; keep keys identical
3. Register the language in `src/i18n/index.js` (the `resources` map)
4. Add a flag emoji + label in `LANG_OPTIONS` in `src/ui/settings.js`
5. Test live language switching from Settings — view should re-render

## Architecture notes worth knowing

- **The frontend never touches storage directly.** All state changes go through Tauri commands
  in `src-tauri/src/commands.rs`. JS calls `invoke("foo", ...)` via `src/api/index.js`.
- **Atomic writes only.** `storage.rs` writes to `data.json.tmp`, `fsync`s, then renames over the
  real file. A rolling `data.json.bak` is kept. Don't bypass this for "just a quick save".
- **Streaks are derived, not stored.** When a day is edited, the relevant streak is recomputed
  from scratch by walking history. This makes retroactive edits trivially correct.
- **Day status is cached.** `recompute_day_status` updates a small cache so the calendar view
  doesn't have to recompute every visible day on every render.

## WSLg env vars

If you're developing on WSL2, the window won't appear without these:

```bash
WEBKIT_DISABLE_COMPOSITING_MODE=1 \
WEBKIT_DISABLE_DMABUF_RENDERER=1 \
LIBGL_ALWAYS_SOFTWARE=1 \
npm run tauri:dev
```

The cosmetic `Gtk-CRITICAL gtk_widget_get_scale_factor` warning in the logs is harmless.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
