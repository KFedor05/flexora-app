use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

mod commands;
mod day_engine;
mod errors;
mod model;
mod state;
mod storage;
mod streaks;
mod validate;

use crate::state::AppState;
use crate::storage::Storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Belt-and-braces single-instance gate: tauri-plugin-single-instance has a
    // small race on Windows between CreateMutex and the registration of its
    // hidden event-target window. Two fast launches (e.g. several quick clicks
    // on the taskbar pin) can both pass the mutex check, and the second one
    // misses the window via FindWindow and silently boots its own primary —
    // we end up with two Flexora processes writing to the same data.json.
    // Pre-flight here using OpenMutexW (read-only, no creation, so we don't
    // poison the plugin's own check) and patiently wait for the plugin's
    // window so we can hand off the focus signal it expects.
    #[cfg(windows)]
    {
        if try_redirect_to_existing_instance() {
            std::process::exit(0);
        }
    }

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }))
            .plugin(tauri_plugin_window_state::Builder::new().build())
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ));
    }

    builder
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("flexora".into()),
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                ])
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("app_data_dir not available");
            let storage = Storage::new(data_dir)?;
            let shared = AppState::boot(storage)?;
            app.manage(shared);

            #[cfg(desktop)]
            setup_tray(app.handle())?;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_app_data,
            commands::create_habit,
            commands::update_habit,
            commands::archive_habit,
            commands::complete_habit,
            commands::create_section,
            commands::update_section,
            commands::delete_section,
            commands::get_day,
            commands::toggle_entry,
            commands::set_entry_counter,
            commands::toggle_freeze_entry,
            commands::toggle_skip_day,
            commands::get_month,
            commands::get_year,
            commands::get_years,
            commands::today_iso,
            commands::get_settings,
            commands::update_settings,
            commands::app_version,
            commands::data_dir,
            commands::export_to_path,
            commands::import_from_path,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let should_hide = window
                    .state::<crate::state::SharedState>()
                    .snapshot()
                    .settings
                    .minimize_to_tray;
                if should_hide {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Race-tolerant pre-flight for the Windows single-instance plugin. Returns
/// `true` if this process is a duplicate launch (caller must exit).
///
/// Why this exists: the plugin's `CreateMutexW` and event-window registration
/// are not atomic. If process B starts ~tens of ms after A, B can see the
/// mutex but miss the not-yet-created window, fall through, and become a
/// second primary. We avoid that by using `OpenMutexW` (which never creates
/// a mutex of its own, so we don't sabotage the plugin's check) and polling
/// `FindWindowW` for a few seconds before signalling.
#[cfg(windows)]
fn try_redirect_to_existing_instance() -> bool {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::DataExchange::COPYDATASTRUCT;
    use windows_sys::Win32::System::Threading::OpenMutexW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        FindWindowW, SendMessageW, WM_COPYDATA,
    };

    // Win32 SYNCHRONIZE access right — stable since forever, hard-coded to
    // avoid coupling to whichever windows-sys module re-exports it this week.
    const SYNCHRONIZE: u32 = 0x0010_0000;

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    // Names must match tauri-plugin-single-instance's Windows impl exactly:
    // `{identifier}-sim` mutex, `{identifier}-sic` class, `{identifier}-siw`
    // window. Keep this in sync with tauri.conf.json's `identifier`.
    const APP_ID: &str = "com.flexora.app";
    let mutex_name = wide(&format!("{APP_ID}-sim"));
    let class_name = wide(&format!("{APP_ID}-sic"));
    let window_name = wide(&format!("{APP_ID}-siw"));

    let mutex = unsafe { OpenMutexW(SYNCHRONIZE, 0, mutex_name.as_ptr()) };
    if mutex.is_null() {
        return false; // No primary yet — this process becomes primary.
    }
    unsafe {
        CloseHandle(mutex);
    }

    // Primary is up (or finishing its plugin setup). Poll for its hidden
    // event-target window so we can deliver the focus signal.
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        let hwnd = unsafe { FindWindowW(class_name.as_ptr(), window_name.as_ptr()) };
        if !hwnd.is_null() {
            // WMCOPYDATA_SINGLE_INSTANCE_DATA = 1542 in the plugin; payload is
            // `"<cwd>|<arg0>|<arg1>...\0"`. Plugin parses on `|` and invokes
            // the callback we register in `run()` (which unminimises + focuses
            // the main window).
            let cwd = std::env::current_dir().unwrap_or_default();
            let cwd = cwd.to_str().unwrap_or_default();
            let args = std::env::args().collect::<Vec<_>>().join("|");
            let payload = format!("{cwd}|{args}\0");
            let bytes = payload.as_bytes();
            let cds = COPYDATASTRUCT {
                dwData: 1542,
                cbData: bytes.len() as u32,
                lpData: bytes.as_ptr() as _,
            };
            unsafe {
                SendMessageW(hwnd, WM_COPYDATA, 0, &cds as *const _ as _);
            }
            return true;
        }
        if Instant::now() >= deadline {
            // Primary mutex exists but window never appeared (primary may be
            // wedged or in the middle of a slow startup). Exit silently rather
            // than risk a duplicate: the user can click again.
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

#[cfg(desktop)]
fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Open Flexora", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Flexora")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    // Toggle: if visible & focused → hide, otherwise reveal.
                    let visible = window.is_visible().unwrap_or(false);
                    let focused = window.is_focused().unwrap_or(false);
                    if visible && focused {
                        let _ = window.hide();
                    } else {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}
