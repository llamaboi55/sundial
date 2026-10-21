//! Sundial: notes which app is in front every couple of seconds, saves it as
//! sessions on your computer, and shows where the day went.

mod active;
mod idle;
mod store;
mod tracker;

use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use store::Store;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, RunEvent, WebviewUrl, WebviewWindowBuilder, Wry};
use tauri_plugin_dialog::DialogExt;
use tracker::{Session, Tracker};

const POLL: Duration = Duration::from_secs(2);

struct State {
    tracker: Mutex<Tracker>,
    store: Store,
    /// Paused until this time (ms). u64::MAX means until resumed.
    paused_until: Mutex<Option<u64>>,
    pause_item: Mutex<Option<MenuItem<Wry>>>,
}

#[derive(Serialize, Clone)]
struct Status {
    paused_until: Option<u64>,
    current: Option<Session>,
    now: u64,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn status_of(state: &State) -> Status {
    Status { paused_until: *state.paused_until.lock().unwrap(), current: state.tracker.lock().unwrap().current.clone(), now: now_ms() }
}

fn save(state: &State, s: Option<Session>) {
    if let Some(s) = s {
        if let Err(e) = state.store.append(&s) {
            eprintln!("Sundial couldn't save a session: {e}");
        }
    }
}

/// The loop that watches the front window.
fn watch(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(POLL);
        let state = app.state::<State>();
        let now = now_ms();
        let paused = {
            let mut p = state.paused_until.lock().unwrap();
            if p.is_some_and(|until| now >= until) {
                *p = None;
                refresh_pause_item(&app, false);
            }
            p.is_some()
        };
        let ended = {
            let mut t = state.tracker.lock().unwrap();
            if paused {
                t.flush()
            } else {
                let (sample, idle) = (active::current(), idle::idle_ms());
                if std::env::var_os("SUNDIAL_DEBUG").is_some() {
                    eprintln!("sample {sample:?} idle {idle:?}");
                }
                t.observe(now, sample, idle)
            }
        };
        save(&state, ended);
        let _ = app.emit("sundial://tick", status_of(&state));
    });
}

fn refresh_pause_item(app: &AppHandle, paused: bool) {
    if let Some(item) = app.state::<State>().pause_item.lock().unwrap().as_ref() {
        let _ = item.set_text(if paused { "Resume tracking" } else { "Pause tracking" });
    }
}

fn set_pause(app: &AppHandle, until: Option<u64>) {
    let state = app.state::<State>();
    *state.paused_until.lock().unwrap() = until;
    if until.is_some() {
        let ended = state.tracker.lock().unwrap().flush();
        save(&state, ended);
    }
    refresh_pause_item(app, until.is_some());
    let _ = app.emit("sundial://tick", status_of(&state));
}

#[tauri::command]
fn sessions(state: tauri::State<State>, from: u64, to: u64) -> Vec<Session> {
    let mut list = state.store.range(from, to);
    if let Some(cur) = state.tracker.lock().unwrap().current.clone() {
        if cur.end > from && cur.start < to && cur.end > cur.start {
            list.push(cur);
        }
    }
    list
}

#[tauri::command]
fn status(state: tauri::State<State>) -> Status {
    status_of(&state)
}

/// minutes: 0 resumes, None pauses until resumed.
#[tauri::command]
fn pause(app: AppHandle, minutes: Option<u64>) {
    let until = match minutes {
        Some(0) => None,
        Some(m) => Some(now_ms() + m * 60_000),
        None => Some(u64::MAX),
    };
    set_pause(&app, until);
}

#[tauri::command]
fn set_options(state: tauri::State<State>, idle_minutes: u64, titles: bool) {
    let mut t = state.tracker.lock().unwrap();
    t.idle_limit_ms = idle_minutes.clamp(1, 60) * 60_000;
    t.titles = titles;
}

/// Saves text (a CSV export) where the user picks. Returns whether it was saved.
#[tauri::command]
async fn export(app: AppHandle, name: String, text: String) -> bool {
    let Some(path) = app.dialog().file().set_file_name(&name).add_filter("CSV", &["csv"]).blocking_save_file() else { return false };
    let Ok(path) = path.into_path() else { return false };
    std::fs::write(path, text).is_ok()
}

#[tauri::command]
fn clear_data(state: tauri::State<State>) {
    state.tracker.lock().unwrap().current = None;
    state.store.clear();
}

#[tauri::command]
fn open_dashboard(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(&app, "main", WebviewUrl::App("index.html".into()))
        .title("Sundial")
        .inner_size(1100.0, 780.0)
        .min_inner_size(720.0, 560.0)
        .center()
        .build();
}

/// The little nudge card in the corner of the main screen.
fn build_nudge(app: &AppHandle) -> tauri::Result<()> {
    let win = WebviewWindowBuilder::new(app, "nudge", WebviewUrl::App("nudge.html".into()))
        .title("Sundial")
        .inner_size(420.0, 180.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .build()?;
    place_nudge(&win);
    Ok(())
}

fn place_nudge(win: &tauri::WebviewWindow) {
    if let (Ok(Some(m)), Ok(size)) = (win.primary_monitor(), win.outer_size()) {
        let area = m.work_area();
        let margin = (16.0 * m.scale_factor()) as i32;
        let x = area.position.x + area.size.width as i32 - size.width as i32 - margin;
        let y = area.position.y + area.size.height as i32 - size.height as i32 - margin;
        let _ = win.set_position(PhysicalPosition::new(x, y));
    }
}

#[tauri::command]
fn show_nudge(app: AppHandle) {
    if let Some(win) = app.get_webview_window("nudge") {
        place_nudge(&win);
        let _ = win.show();
    }
}

#[tauri::command]
fn hide_nudge(app: AppHandle) {
    if let Some(win) = app.get_webview_window("nudge") {
        let _ = win.hide();
    }
}

#[tauri::command]
fn quit(app: AppHandle) {
    let state = app.state::<State>();
    let ended = state.tracker.lock().unwrap().flush();
    save(&state, ended);
    app.exit(0);
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| open_dashboard(app.clone())))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![sessions, status, pause, set_options, export, clear_data, open_dashboard, show_nudge, hide_nudge, quit])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let dir = app.path().app_data_dir()?.join("sessions");
            app.manage(State { tracker: Mutex::new(Tracker::new()), store: Store::new(dir), paused_until: Mutex::new(None), pause_item: Mutex::new(None) });
            let handle = app.handle().clone();
            build_nudge(&handle)?;

            let open = MenuItem::with_id(app, "open", "Open Sundial", true, None::<&str>)?;
            let hour = MenuItem::with_id(app, "hour", "Pause for an hour", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "Pause tracking", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Sundial", true, None::<&str>)?;
            let s1 = PredefinedMenuItem::separator(app)?;
            let s2 = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&open, &s1, &hour, &pause, &s2, &quit_item])?;
            *app.state::<State>().pause_item.lock().unwrap() = Some(pause);

            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().expect("app icon"))
                .tooltip("Sundial")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => open_dashboard(app.clone()),
                    "hour" => set_pause(app, Some(now_ms() + 3_600_000)),
                    "pause" => {
                        let paused = app.state::<State>().paused_until.lock().unwrap().is_some();
                        set_pause(app, if paused { None } else { Some(u64::MAX) });
                    }
                    "quit" => quit(app.clone()),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        open_dashboard(tray.app_handle().clone());
                    }
                })
                .build(app)?;

            watch(handle.clone());
            if let Ok(marker) = handle.path().app_config_dir().map(|d| d.join("launched")) {
                if !marker.exists() {
                    let _ = std::fs::create_dir_all(marker.parent().unwrap());
                    let _ = std::fs::write(&marker, b"1");
                    open_dashboard(handle);
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while starting Sundial");
    app.run(|app, event| {
        // Closing the dashboard keeps Sundial running in the tray.
        if let RunEvent::ExitRequested { code: None, api, .. } = &event {
            api.prevent_exit();
        }
        if let RunEvent::Exit = &event {
            let state = app.state::<State>();
            let ended = state.tracker.lock().unwrap().flush();
            save(&state, ended);
        }
    });
}
