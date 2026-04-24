use tauri::{Manager, State};
use crate::{AppState, db::{self, AbiEntry, DbStats}};

#[tauri::command]
pub fn lookup_abi(
    state: State<AppState>,
    byte_sign: String,
    count: Option<usize>,
) -> Result<Vec<AbiEntry>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::lookup_abi(&conn, &byte_sign, count.unwrap_or(1))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn lookup_event_abi(
    state: State<AppState>,
    topic0: String,
    count: Option<usize>,
) -> Result<Vec<AbiEntry>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::lookup_event_abi(&conn, &topic0, count.unwrap_or(1))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_db_stats(
    state: State<AppState>,
) -> Result<DbStats, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::get_stats(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_signatures(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<serde_json::Value, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = data_dir.join("func_signs.db");
    tauri::async_runtime::spawn_blocking(move || {
        let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
        db::import_csv(&conn, &file_path)
            .map(|r| serde_json::json!({ "rows_imported": r.rows_imported }))
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn apply_delta(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<serde_json::Value, String> {
    import_signatures(app, file_path).await
}
