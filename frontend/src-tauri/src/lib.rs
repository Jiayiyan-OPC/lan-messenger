mod commands;
mod discovery;
mod storage;

use storage::Database;
use std::path::PathBuf;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize database
            let app_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            std::fs::create_dir_all(&app_dir).ok();
            let db_path = app_dir.join("lan-messenger.db");
            let db = Database::open(&db_path)
                .expect("Failed to open database");
            app.manage(db);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_contacts,
            commands::get_online_contacts,
            commands::get_contact,
            commands::delete_contact,
            commands::get_messages,
            commands::get_message,
            commands::delete_message,
            commands::delete_messages_by_contact,
            commands::send_message,
            commands::start_discovery,
            commands::stop_discovery,
            commands::get_discovered_peers,
            commands::initiate_file_transfer,
            commands::accept_file_transfer,
            commands::reject_file_transfer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
