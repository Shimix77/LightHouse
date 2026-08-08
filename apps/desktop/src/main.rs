#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend;

use std::path::PathBuf;
use std::sync::Mutex;

use backend::{DesktopBackend, UiBootstrap, UiEngineCommand, UiEngineView, UiProjectCommand};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            new_project,
            open_project,
            open_recent_project,
            save_project_as,
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

#[tauri::command]
async fn new_project(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<DesktopBackend>>,
) -> Result<Option<UiBootstrap>, String> {
    let path = save_dialog(app, "Untitled Show.lightshow").await?;
    let Some(path) = path else {
        return Ok(None);
    };
    state
        .lock()
        .map_err(|_| "desktop backend lock is poisoned".to_owned())?
        .create_project(path)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_project(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<DesktopBackend>>,
) -> Result<Option<UiBootstrap>, String> {
    let directory = state
        .lock()
        .map_err(|_| "desktop backend lock is poisoned".to_owned())?
        .project_path()
        .parent()
        .map(PathBuf::from);
    let path = open_dialog(app, directory).await?;
    let Some(path) = path else {
        return Ok(None);
    };
    state
        .lock()
        .map_err(|_| "desktop backend lock is poisoned".to_owned())?
        .open_project(path)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_recent_project(
    state: tauri::State<'_, Mutex<DesktopBackend>>,
    path: String,
) -> Result<UiBootstrap, String> {
    state
        .lock()
        .map_err(|_| "desktop backend lock is poisoned".to_owned())?
        .open_project(PathBuf::from(path))
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_project_as(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<DesktopBackend>>,
) -> Result<Option<UiBootstrap>, String> {
    let file_name = state
        .lock()
        .map_err(|_| "desktop backend lock is poisoned".to_owned())?
        .project_path()
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Untitled Show.lightshow")
        .to_owned();
    let path = save_dialog(app, &file_name).await?;
    let Some(path) = path else {
        return Ok(None);
    };
    state
        .lock()
        .map_err(|_| "desktop backend lock is poisoned".to_owned())?
        .save_project_as(path)
        .map(Some)
        .map_err(|error| error.to_string())
}

async fn open_dialog(
    app: tauri::AppHandle,
    directory: Option<PathBuf>,
) -> Result<Option<PathBuf>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app
            .dialog()
            .file()
            .set_title("Open LightHouse Project")
            .add_filter("LightHouse Project", &["lightshow"]);
        if let Some(directory) = directory {
            dialog = dialog.set_directory(directory);
        }
        dialog
            .blocking_pick_file()
            .map(|path| path.into_path().map_err(|error| error.to_string()))
            .transpose()
    })
    .await
    .map_err(|error| error.to_string())?
}

async fn save_dialog(app: tauri::AppHandle, file_name: &str) -> Result<Option<PathBuf>, String> {
    let file_name = file_name.to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Save LightHouse Project")
            .add_filter("LightHouse Project", &["lightshow"])
            .set_file_name(file_name)
            .blocking_save_file()
            .map(|path| path.into_path().map_err(|error| error.to_string()))
            .transpose()
    })
    .await
    .map_err(|error| error.to_string())?
}
