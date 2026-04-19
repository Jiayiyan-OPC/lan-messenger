use tauri::{command, AppHandle, Emitter};
use serde::{Deserialize, Serialize};

use crate::device::DeviceConfig;
use crate::storage::{Database, Contact, StoredMessage, FileTransfer};
use crate::discovery::DiscoveryService;
use crate::file_transfer::FileTransferHandle;
use crate::messenger::MessengerHandle;
use crate::protocol::types::{MessageType, TextMessage as ProtoTextMessage};

// ============================================================
// IPC Commands
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
    db.query_messages(contact_id.as_deref(), limit.unwrap_or(50), offset.unwrap_or(0))
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
    device: tauri::State<'_, DeviceConfig>,
) -> Result<StoredMessage, String> {
    let msg = StoredMessage {
        id: uuid::Uuid::new_v4().to_string(),
        sender_id: device.device_id.clone(),
        recipient_id: request.recipient_id,
        content: request.content,
        timestamp: chrono::Utc::now().timestamp_millis(),
        status: "sending".to_string(),
        file_transfer_id: None,
    };

    db.insert_message(&msg).map_err(|e| e.to_string())?;

    // Look up recipient to get their IP and port
    let contact = db.get_contact(&msg.recipient_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Contact {} not found", msg.recipient_id))?;

    let proto_msg = ProtoTextMessage {
        msg_type: MessageType::TextMsg as u8,
        msg_id: msg.id.clone(),
        from_id: device.device_id.clone(),
        timestamp: msg.timestamp as u64,
        content: msg.content.clone(),
    };

    let peer_addr = format!("{}:{}", contact.ip_address, contact.port)
        .parse()
        .map_err(|e: std::net::AddrParseError| e.to_string())?;

    let messenger = app.state::<MessengerHandle>();
    messenger.send_message(peer_addr, proto_msg)
        .await
        .map_err(|e| e.to_string())?;

    db.update_message_status(&msg.id, "sent").map_err(|e| e.to_string())?;
    let _ = app.emit("message-sent", &msg);
    Ok(msg)
}

// --- Discovery ---

#[command]
pub async fn start_discovery() -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn stop_discovery() -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn get_discovered_peers() -> Result<Vec<PeerResponse>, String> {
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
    db: tauri::State<'_, Database>,
) -> Result<String, String> {
    let contact = db.get_contact(&request.recipient_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Contact {} not found", request.recipient_id))?;

    let peer_addr: std::net::SocketAddr = format!("{}:{}", contact.ip_address, crate::file_transfer::service::FILE_PORT)
        .parse()
        .map_err(|e: std::net::AddrParseError| e.to_string())?;

    let ft = app.state::<FileTransferHandle>();
    let transfer_id = ft.send_file(
        peer_addr,
        std::path::PathBuf::from(&request.file_path),
        request.recipient_id,
    ).await.map_err(|e| e.to_string())?;

    let _ = app.emit("file-transfer-initiated", &transfer_id);
    Ok(transfer_id)
}

#[command]
pub async fn accept_file_transfer(transfer_id: String, app: AppHandle) -> Result<(), String> {
    let _ = app.emit("file-transfer-accepted", &transfer_id);
    Ok(())
}

#[command]
pub async fn reject_file_transfer(transfer_id: String, app: AppHandle) -> Result<(), String> {
    let _ = app.emit("file-transfer-rejected", &transfer_id);
    Ok(())
}
