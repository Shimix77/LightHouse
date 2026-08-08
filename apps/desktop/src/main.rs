#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend;

use std::sync::Mutex;

use backend::{DesktopBackend, UiBootstrap, UiEngineCommand, UiEngineView};
use tauri::Manager;

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
            engine_command
        ])
        .run(tauri::generate_context!())
        .expect("failed to run LightHouse desktop application");
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
