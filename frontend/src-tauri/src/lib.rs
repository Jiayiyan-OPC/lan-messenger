mod commands;
mod device;
mod discovery;
mod file_transfer;
mod messenger;
mod net;
mod protocol;
mod storage;

use device::DeviceConfig;
use file_transfer::service::{FileRequestDecision, PendingRequests};
use file_transfer::FileTransferService;
use messenger::MessengerService;
use storage::Database;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::{oneshot, Mutex};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
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
            // Reset every contact's `online` flag before discovery starts.
            // Otherwise rows persisted as `online = 1` from a previous session
            // show as online in the UI even when the peer is powered off and
            // never sends a heartbeat — discovery only emits `peer-lost` for
            // peers it has registered in the current session's in-memory map.
            // Discovery will mark them online again as heartbeats arrive.
            if let Err(e) = db.mark_all_contacts_offline() {
                log::warn!("failed to reset contacts to offline on startup: {}", e);
            }
            // Any transfer left as pending/transferring in the DB is orphaned
            // from a previous run — its worker task doesn't exist anymore.
            // Flip to failed so persisted chat cards render a real terminal
            // state instead of a zombie progress bar.
            if let Err(e) = db.mark_in_flight_transfers_failed() {
                log::warn!("failed to reset in-flight transfers on startup: {}", e);
            }
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
                device_id.clone(),
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

            // Surface incoming transfer requests to the UI and block the
            // receive pipeline until the user picks a save path (or
            // rejects). The callback parks a oneshot tx in `PendingRequests`;
            // the accept/reject commands pop it + send the decision.
            // 5-minute timeout auto-rejects so a stale request can't hang
            // the file-transfer listener forever.
            let pending_requests: PendingRequests = Arc::new(Mutex::new(HashMap::new()));
            app.manage(pending_requests.clone());

            let ft_app4 = app.handle().clone();
            let pending_for_cb = pending_requests.clone();
            ft_svc.on_file_request(move |req| {
                let app = ft_app4.clone();
                let pending = pending_for_cb.clone();
                async move {
                    use tauri::Emitter;
                    let (tx, rx) = oneshot::channel::<FileRequestDecision>();
                    pending.lock().await.insert(req.transfer_id.clone(), tx);
                    log::info!(
                        "file-request pending: transfer_id={} file={} size={} from={}",
                        req.transfer_id, req.filename, req.file_size, req.from_id
                    );
                    let emit_result = app.emit(
                        "file-request",
                        serde_json::json!({
                            "transfer_id": req.transfer_id,
                            "file_name": req.filename,
                            "file_size": req.file_size,
                            "from_id": req.from_id,
                        }),
                    );
                    if let Err(e) = emit_result {
                        log::error!("failed to emit file-request: {}", e);
                        pending.lock().await.remove(&req.transfer_id);
                        return FileRequestDecision::Reject;
                    }
                    match tokio::time::timeout(
                        std::time::Duration::from_secs(300),
                        rx,
                    )
                    .await
                    {
                        Ok(Ok(decision)) => decision,
                        Ok(Err(_)) => {
                            log::warn!(
                                "file-request oneshot dropped for {}, rejecting",
                                req.transfer_id
                            );
                            FileRequestDecision::Reject
                        }
                        Err(_) => {
                            log::warn!(
                                "file-request timed out for {}, rejecting",
                                req.transfer_id
                            );
                            pending.lock().await.remove(&req.transfer_id);
                            FileRequestDecision::Reject
                        }
                    }
                }
            });

            let ft_handle = tauri::async_runtime::block_on(ft_svc.start())
                .expect("Failed to start file transfer service");
            app.manage(ft_handle);

            // Discovery service plumbing.
            //
            // Order matters here (network-adversary review, Scenario D):
            //   1. Build the MPSC channel.
            //   2. Open the DB handle for the consumer thread.
            //   3. **Spawn the consumer thread BEFORE `discovery_svc.start()`**
            //      so the channel is being drained from t=0.
            //   4. Only then start discovery — by the time the receiver socket
            //      starts emitting `PeerFound` events, the consumer is already
            //      blocked on `for event in disc_rx` and ready to handle them.
            //
            // Even though `mpsc::channel()` is unbounded (so events can't be
            // dropped from the channel itself), the previous order of
            // start-then-spawn left a small window where the consumer's own
            // `Database::open()` (a few-ms operation) could lose the race
            // against `mark_all_contacts_offline()`, causing the reset to
            // overwrite a freshly-upserted online row.
            let discovery_config = discovery::DiscoveryConfig {
                broadcast_port: 19876,
                heartbeat_interval: std::time::Duration::from_secs(30),
                timeout_threshold: std::time::Duration::from_secs(90),
                device_id: device_id.clone(),
                device_name: device_name.clone(),
                service_port: messenger::service::MSG_PORT,
            };
            let (disc_tx, disc_rx) = std::sync::mpsc::channel();

            // Spawn the consumer thread FIRST.
            let disc_app = app.handle().clone();
            let disc_db = Database::open(&db_path)
                .expect("Failed to open database for discovery");
            std::thread::spawn(move || {
                use tauri::Emitter;
                for event in disc_rx {
                    match event {
                        discovery::udp::DiscoveryEvent::PeerFound(peer) => {
                            let contact = storage::Contact {
                                id: peer.info.id.clone(),
                                name: peer.info.name.clone(),
                                ip_address: peer.addr.ip().to_string(),
                                port: peer.info.port,
                                online: true,
                                last_seen: chrono::Utc::now().timestamp_millis(),
                                created_at: chrono::Utc::now().timestamp_millis(),
                            };
                            let _ = disc_db.upsert_contact(&contact);
                            let _ = disc_app.emit("peer-found", &contact);
                        }
                        discovery::udp::DiscoveryEvent::PeerLost(id) => {
                            let _ = disc_db.set_contact_online(&id, false);
                            let _ = disc_app.emit("peer-lost", &id);
                        }
                        discovery::udp::DiscoveryEvent::PeerUpdated(peer) => {
                            let contact = storage::Contact {
                                id: peer.info.id.clone(),
                                name: peer.info.name.clone(),
                                ip_address: peer.addr.ip().to_string(),
                                port: peer.info.port,
                                online: true,
                                last_seen: chrono::Utc::now().timestamp_millis(),
                                created_at: chrono::Utc::now().timestamp_millis(),
                            };
                            let _ = disc_db.upsert_contact(&contact);
                            let _ = disc_app.emit("peer-updated", &contact);
                        }
                    }
                }
            });

            // NOW start discovery — consumer is already draining `disc_rx`.
            let discovery_svc = Arc::new(discovery::DiscoveryService::new(discovery_config, disc_tx));
            discovery_svc.start().expect("Failed to start discovery service");
            app.manage(discovery_svc.clone());

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
            commands::cancel_file_transfer,
            commands::get_file_transfers_by_ids,
            commands::file_exists,
            commands::get_device_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
