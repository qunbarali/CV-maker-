use rusqlite::{params, Connection};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{Manager, State};

struct AppDatabase(Mutex<Connection>);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DatabaseHealth {
    integrity: String,
    schema_version: i64,
    resume_count: i64,
    settings_count: i64,
}

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| format!("Cannot locate application data directory: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create application data directory: {e}"))?;
    Ok(dir.join("cv-maker.sqlite3"))
}

#[tauri::command]
fn database_health(db: State<'_, AppDatabase>) -> Result<DatabaseHealth, String> {
    let conn = db.0.lock().map_err(|_| "Database lock is unavailable".to_string())?;
    let integrity: String = conn.query_row("PRAGMA quick_check", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    let schema_version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    let resume_count: i64 = conn.query_row("SELECT COUNT(*) FROM resumes", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    let settings_count: i64 = conn.query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    Ok(DatabaseHealth { integrity, schema_version, resume_count, settings_count })
}

#[tauri::command]
fn load_resumes(db: State<'_, AppDatabase>) -> Result<Vec<serde_json::Value>, String> {
    let conn = db.0.lock().map_err(|_| "Database lock is unavailable".to_string())?;
    let mut stmt = conn.prepare("SELECT payload FROM resumes ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
    let mut resumes = Vec::new();
    for row in rows {
        let payload = row.map_err(|e| e.to_string())?;
        resumes.push(serde_json::from_str(&payload).map_err(|e| format!("Stored resume is invalid JSON: {e}"))?);
    }
    Ok(resumes)
}

#[tauri::command]
fn replace_resumes(resumes: Vec<serde_json::Value>, db: State<'_, AppDatabase>) -> Result<(), String> {
    if resumes.len() > 500 { return Err("Too many documents to save in one operation".into()); }
    let conn = db.0.lock().map_err(|_| "Database lock is unavailable".to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM resumes", []).map_err(|e| e.to_string())?;
    for item in resumes {
        let id = item.get("id").and_then(|v| v.as_str()).ok_or("Resume is missing its id")?;
        let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("Untitled Resume");
        let updated_at = item.get("updatedAt").and_then(|v| v.as_str()).unwrap_or("");
        let payload = serde_json::to_string(&item).map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO resumes (id, title, updated_at, payload) VALUES (?1, ?2, ?3, ?4)", params![id, title, updated_at, payload]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_resume(id: String, db: State<'_, AppDatabase>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|_| "Database lock is unavailable".to_string())?;
    conn.execute("DELETE FROM resumes WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_setting(key: String, db: State<'_, AppDatabase>) -> Result<Option<String>, String> {
    let conn = db.0.lock().map_err(|_| "Database lock is unavailable".to_string())?;
    conn.query_row("SELECT value FROM settings WHERE key = ?1", params![key], |row| row.get(0)).optional().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_setting(key: String, value: String, db: State<'_, AppDatabase>) -> Result<(), String> {
    if key.len() > 128 || value.len() > 2_000_000 { return Err("Setting exceeds allowed size".into()); }
    let conn = db.0.lock().map_err(|_| "Database lock is unavailable".to_string())?;
    conn.execute("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, value]).map_err(|e| e.to_string())?;
    Ok(())
}

use rusqlite::OptionalExtension;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let path = database_path(app.handle()).map_err(std::io::Error::other)?;
            let conn = Connection::open(path).map_err(std::io::Error::other)?;
            conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;").map_err(std::io::Error::other)?;
            let existing_schema: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0)).map_err(std::io::Error::other)?;
            if existing_schema > 1 {
                return Err(std::io::Error::other(format!("Database schema version {existing_schema} is newer than this application supports; update CV Maker before opening this database.")).into());
            }
            // Versioned, idempotent schema initialization keeps upgrades safe for existing installs.
            conn.execute_batch("BEGIN IMMEDIATE; CREATE TABLE IF NOT EXISTS resumes (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, updated_at TEXT NOT NULL, payload TEXT NOT NULL); CREATE INDEX IF NOT EXISTS resumes_updated_at_idx ON resumes(updated_at DESC); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL); PRAGMA user_version = 1; COMMIT;").map_err(std::io::Error::other)?;
            let integrity: String = conn.query_row("PRAGMA quick_check", [], |row| row.get(0)).map_err(std::io::Error::other)?;
            if integrity != "ok" { return Err(std::io::Error::other(format!("SQLite integrity check failed: {integrity}")).into()); }
            app.manage(AppDatabase(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![database_health, load_resumes, replace_resumes, delete_resume, load_setting, save_setting])
        .run(tauri::generate_context!())
        .expect("error while running CV Maker desktop application");
}
