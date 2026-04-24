use tauri::Manager;
use std::sync::Mutex;

pub mod commands;
pub mod db;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("func_signs.db");
            let conn = rusqlite::Connection::open(&db_path)?;
            db::init_schema(&conn)?;
            app.manage(AppState { db: Mutex::new(conn) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::lookup_abi,
            commands::lookup_event_abi,
            commands::get_db_stats,
            commands::import_signatures,
            commands::apply_delta,
        ])
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}
