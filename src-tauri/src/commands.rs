use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AbiEntry {
    pub text_sign: String,
    pub abi: Option<String>,
    pub score: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbStats {
    pub row_count: i64,
}

#[tauri::command]
pub fn lookup_abi(_byte_sign: String, _count: Option<usize>) -> Result<Vec<AbiEntry>, String> {
    Ok(vec![])
}

#[tauri::command]
pub fn lookup_event_abi(_topic0: String, _count: Option<usize>) -> Result<Vec<AbiEntry>, String> {
    Ok(vec![])
}

#[tauri::command]
pub fn get_db_stats() -> Result<DbStats, String> {
    Ok(DbStats { row_count: 0 })
}

#[tauri::command]
pub async fn import_signatures(_file_path: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "rows_imported": 0 }))
}

#[tauri::command]
pub async fn apply_delta(_file_path: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "rows_imported": 0 }))
}
