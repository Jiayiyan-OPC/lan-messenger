use tauri::{command, AppHandle, Emitter};
use serde::{Deserialize, Serialize};

use crate::storage::{Database, Contact, StoredMessage, FileTransfer};
use crate::discovery::DiscoveryService;

// ============================================================
// IPC Commands - invoked from frontend via `invoke()`
// ============================================================

// --- Contacts ---

#[command]
pub async fn get_contacts(db: tauri::State<'_, Database>) -> Result<Vec<Contact>, String> {
    db.get_all_contacts().map_err(|e| e.to_string())
}

#[command]
pub async fn get_online_contacts(db: tauri::State<'_, Database>) -> Result<Vec<Contact>, String> {
    db.get_online_contacts().map_err(|e| e.to_string())
}

#[command]
pub async fn get_contact(id: String, db: tauri::State<'_, Database>) -> Result<Option<Contact>, String> {
    db.get_contact(&id).map_err(|e| e.to_string())
}

#[command]
pub async fn delete_contact(id: String, db: tauri::State<'_, Database>) -> Result<(), String> {
    db.delete_contact(&id).map_err(|e| e.to_string())
}

// --- Messages ---

#[command]
pub async fn get_messages(
    contact_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    db: tauri::State<'_, Database>,
) -> Result<Vec<StoredMessage>, String> {
    db.query_messages(
        contact_id.as_deref(),
        limit.unwrap_or(50),
        offset.unwrap_or(0),
    )
    .map_err(|e| e.to_string())
}

#[command]
pub async fn get_message(id: String, db: tauri::State<'_, Database>) -> Result<Option<StoredMessage>, String> {
    db.get_message(&id).map_err(|e| e.to_string())
}

#[command]
pub async fn delete_message(id: String, db: tauri::State<'_, Database>) -> Result<(), String> {
    db.delete_message(&id).map_err(|e| e.to_string())
}

#[command]
pub async fn delete_messages_by_contact(
    contact_id: String,
    db: tauri::State<'_, Database>,
) -> Result<(), String> {
    db.delete_messages_by_contact(&contact_id).map_err(|e| e.to_string())
}

// --- Send Message ---

#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub recipient_id: String,
    pub content: String,
}

#[command]
pub async fn send_message(
    request: SendMessageRequest,
    app: AppHandle,
    db: tauri::State<'_, Database>,
) -> Result<StoredMessage, String> {
    // Create message record
    let msg = StoredMessage {
        id: uuid::Uuid::new_v4().to_string(),
        sender_id: "self".to_string(), // Will be replaced with actual device ID
        recipient_id: request.recipient_id,
        content: request.content,
        timestamp: chrono::Utc::now().timestamp_millis(),
        status: "sending".to_string(),
        file_transfer_id: None,
    };

    db.insert_message(&msg).map_err(|e| e.to_string())?;

    // TODO: Actually send via network (T5/T6 dependency)
    // For now, just mark as sent
    db.update_message_status(&msg.id, "sent").map_err(|e| e.to_string())?;

    // Emit event to frontend
    let _ = app.emit("message-sent", &msg);

    Ok(msg)
}

// --- Discovery ---

#[command]
pub async fn start_discovery() -> Result<(), String> {
    // Managed by app state, started on app init
    Ok(())
}

#[command]
pub async fn stop_discovery() -> Result<(), String> {
    // Managed by app state, stopped on app close
    Ok(())
}

#[command]
pub async fn get_discovered_peers() -> Result<Vec<PeerResponse>, String> {
    // TODO: Get from discovery service state
    Ok(vec![])
}

#[derive(Debug, Clone, Serialize)]
pub struct PeerResponse {
    pub id: String,
    pub name: String,
    pub ip_address: String,
    pub port: u16,
}

// --- File Transfer ---

#[derive(Debug, Deserialize)]
pub struct FileTransferRequest {
    pub recipient_id: String,
    pub file_path: String,
}

#[command]
pub async fn initiate_file_transfer(
    request: FileTransferRequest,
    app: AppHandle,
) -> Result<String, String> {
    // TODO: Implement file transfer initiation (T5/T6)
    let transfer_id = uuid::Uuid::new_v4().to_string();
    let _ = app.emit("file-transfer-initiated", &transfer_id);
    Ok(transfer_id)
}

#[command]
pub async fn accept_file_transfer(transfer_id: String, app: AppHandle) -> Result<(), String> {
    // TODO: Accept incoming file transfer
    let _ = app.emit("file-transfer-accepted", &transfer_id);
    Ok(())
}

#[command]
pub async fn reject_file_transfer(transfer_id: String, app: AppHandle) -> Result<(), String> {
    let _ = app.emit("file-transfer-rejected", &transfer_id);
    Ok(())
}

// ============================================================
// Events - emitted from backend to frontend
// ============================================================
// Event names (constants for consistency):
// - "message-received"     — new incoming message
// - "message-sent"         — message successfully sent
// - "peer-found"           — new device discovered
// - "peer-lost"            — device went offline
// - "peer-updated"         — device info changed
// - "file-transfer-progress" — transfer progress update
// - "file-transfer-complete" — transfer finished
// - "file-transfer-initiated" — outgoing transfer started
// - "file-transfer-accepted" — incoming transfer accepted
// - "file-transfer-rejected" — incoming transfer rejected

/// Register all IPC commands with the Tauri builder.
/// Call this in lib.rs: `.invoke_handler(tauri::generate_handler![...])`
pub fn get_handlers() -> Vec<&'static str> {
    // This is just documentation; actual registration uses the macro:
    // tauri::generate_handler![
    //   get_contacts, get_online_contacts, get_contact, delete_contact,
    //   get_messages, get_message, delete_message, delete_messages_by_contact,
    //   send_message,
    //   start_discovery, stop_discovery, get_discovered_peers,
    //   initiate_file_transfer, accept_file_transfer, reject_file_transfer,
    // ]
    vec![]
}
