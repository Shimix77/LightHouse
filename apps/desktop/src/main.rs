#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend;

use std::sync::Mutex;

use backend::{DesktopBackend, UiBootstrap, UiEngineCommand, UiEngineView, UiProjectCommand};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            app.manage(Mutex::new(DesktopBackend::open(app_data_dir)?));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_bootstrap,
            refresh_engine,
            engine_command,
            project_command,
            open_live_window
        ])
        .run(tauri::generate_context!())
        .expect("failed to run LightHouse desktop application");
}

#[tauri::command]
fn open_live_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("live-display") {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(
        &app,
        "live-display",
        WebviewUrl::App("index.html?display=live".into()),
    )
    .title("LightHouse — Live Display")
    .inner_size(1280.0, 760.0)
    .min_inner_size(900.0, 600.0)
    .resizable(true)
    .build()
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_bootstrap(state: tauri::State<'_, Mutex<DesktopBackend>>) -> Result<UiBootstrap, String> {
    state
        .lock()
        .map_err(|_| "desktop backend lock is poisoned".to_owned())?
        .bootstrap()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn refresh_engine(state: tauri::State<'_, Mutex<DesktopBackend>>) -> Result<UiEngineView, String> {
    state
        .lock()
        .map_err(|_| "desktop backend lock is poisoned".to_owned())?
        .refresh()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn engine_command(
    state: tauri::State<'_, Mutex<DesktopBackend>>,
    command: UiEngineCommand,
) -> Result<UiEngineView, String> {
    state
        .lock()
        .map_err(|_| "desktop backend lock is poisoned".to_owned())?
        .command(command)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn project_command(
    state: tauri::State<'_, Mutex<DesktopBackend>>,
    command: UiProjectCommand,
) -> Result<UiBootstrap, String> {
    state
        .lock()
        .map_err(|_| "desktop backend lock is poisoned".to_owned())?
        .project_command(command)
        .map_err(|error| error.to_string())
}
