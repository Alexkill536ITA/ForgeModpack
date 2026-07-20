// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod files;
mod mods;

use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Cache locale (SQLite) per le versioni di Minecraft e dei mod loader:
    // evita di interrogare le API remote a ogni avvio. I dati vengono salvati
    // come JSON serializzato in una semplice tabella key-value.
    let migrations = vec![Migration {
        version: 1,
        description: "create_manifest_cache",
        sql: "CREATE TABLE IF NOT EXISTS manifest_cache (key TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL);",
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:forgemodpack.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            mods::scan_mods,
            mods::resolve_keybind_labels,
            files::read_dir_tree
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
