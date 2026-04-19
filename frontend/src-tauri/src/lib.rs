mod commands;
mod device;
mod discovery;
mod file_transfer;
mod messenger;
mod protocol;
mod storage;

use device::DeviceConfig;
use file_transfer::FileTransferService;
use messenger::MessengerService;
use storage::Database;
use std::path::PathBuf;
use std::sync::Arc;

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

            // Generate or load device ID
            let messenger_db = Arc::new(Database::open(&db_path)
                .expect("Failed to open database for messenger"));

            let device_id = {
                let db_ref = messenger_db.as_ref();
                match db_ref.get_config("device_id") {
                    Ok(Some(id)) => id,
                    _ => {
                        let id = uuid::Uuid::new_v4().to_string();
                        let _ = db_ref.set_config("device_id", &id);
                        id
                    }
                }
            };
            let device_name = {
                let db_ref = messenger_db.as_ref();
                match db_ref.get_config("device_name") {
                    Ok(Some(name)) => name,
                    _ => {
                        let name = hostname::get()
                            .map(|h| h.to_string_lossy().to_string())
                            .unwrap_or_else(|_| "LAN Messenger".to_string());
                        let _ = db_ref.set_config("device_name", &name);
                        name
                    }
                }
            };

            app.manage(DeviceConfig {
                device_id: device_id.clone(),
                device_name: device_name.clone(),
            });

            // Start messenger service
            let mut messenger_svc = MessengerService::new(
                messenger::service::MSG_PORT,
                messenger_db,
            );

            let app_handle = app.handle().clone();
            let dev_id = device_id.clone();
            messenger_svc.on_message(move |msg| {
                use tauri::Emitter;
                let _ = app_handle.emit("message-received", &storage::StoredMessage {
                    id: msg.msg_id.clone(),
                    sender_id: msg.from_id.clone(),
                    recipient_id: dev_id.clone(),
                    content: msg.content.clone(),
                    timestamp: msg.timestamp as i64,
                    status: "received".to_string(),
                    file_transfer_id: None,
                });
            });

            let handle = tauri::async_runtime::block_on(messenger_svc.start())
                .expect("Failed to start messenger service");
            app.manage(handle);

            // Start file transfer service
            let ft_db = Arc::new(Database::open(&db_path)
                .expect("Failed to open database for file transfer"));
            let download_dir = app_dir.join("downloads");
            let mut ft_svc = FileTransferService::new(
                file_transfer::service::FILE_PORT,
                ft_db,
                download_dir,
            );

            let ft_app = app.handle().clone();
            ft_svc.on_progress(move |id, transferred, total| {
                use tauri::Emitter;
                let _ = ft_app.emit("file-transfer-progress", serde_json::json!({
                    "transfer_id": id,
                    "progress": transferred as f64 / total as f64,
                    "bytes_transferred": transferred,
                    "total_bytes": total,
                }));
            });

            let ft_app2 = app.handle().clone();
            ft_svc.on_complete(move |id| {
                use tauri::Emitter;
                let _ = ft_app2.emit("file-transfer-complete", serde_json::json!({ "transfer_id": id }));
            });

            let ft_app3 = app.handle().clone();
            ft_svc.on_failed(move |id, reason| {
                use tauri::Emitter;
                let _ = ft_app3.emit("transfer-failed", serde_json::json!({ "transfer_id": id, "reason": reason }));
            });

            let ft_handle = tauri::async_runtime::block_on(ft_svc.start())
                .expect("Failed to start file transfer service");
            app.manage(ft_handle);

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
