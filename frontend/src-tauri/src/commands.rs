use tauri::{command, AppHandle, Emitter, Manager};
use serde::{Deserialize, Serialize};
use std::path::{Component, PathBuf};
use std::sync::Arc;

use crate::device::DeviceConfig;
use crate::storage::{Database, Contact, StoredMessage, FileTransfer};
use crate::discovery::DiscoveryService;
use crate::file_transfer::service::{FileRequestDecision, PendingRequests};
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
    let mut msg = StoredMessage {
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
    // Sync the in-memory struct with the DB status before emitting / returning —
    // otherwise the frontend listener sees `status:"sending"` forever and the
    // bubble spinner never resolves to a check mark.
    msg.status = "sent".to_string();
    let _ = app.emit("message-sent", &msg);
    Ok(msg)
}

// --- Discovery ---

#[command]
pub async fn start_discovery(
    discovery: tauri::State<'_, Arc<crate::discovery::DiscoveryService>>,
) -> Result<(), String> {
    discovery.start().map_err(|e| e.to_string())
}

#[command]
pub async fn stop_discovery(
    discovery: tauri::State<'_, Arc<crate::discovery::DiscoveryService>>,
) -> Result<(), String> {
    discovery.stop();
    Ok(())
}

#[command]
pub async fn get_discovered_peers(
    discovery: tauri::State<'_, Arc<crate::discovery::DiscoveryService>>,
) -> Result<Vec<PeerResponse>, String> {
    let peers = discovery.get_peers();
    Ok(peers
        .into_iter()
        .map(|p| PeerResponse {
            id: p.info.id,
            name: p.info.name,
            ip_address: p.addr.ip().to_string(),
            port: p.info.port,
        })
        .collect())
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

/// Validate a save_path coming from the IPC boundary. The native save
/// dialog returns sane absolute paths, but this command can be invoked
/// directly via the IPC bridge — defense-in-depth so a malicious caller
/// can't ask us to write `/etc/passwd` or pull a `..` traversal.
fn validate_save_path(path: &std::path::Path) -> Result<(), String> {
    if path.as_os_str().is_empty() {
        return Err("save_path is empty".into());
    }
    if !path.is_absolute() {
        return Err("save_path must be absolute".into());
    }
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err("save_path may not contain '..'".into());
    }
    // Block writes into well-known system / OS-managed locations. We
    // intentionally keep this list narrow — anything outside HOME is
    // still allowed (USB drives, /tmp, etc.) so as not to surprise users
    // who pick non-default locations from the save dialog.
    const FORBIDDEN_PREFIXES: &[&str] = &[
        "/etc",
        "/usr",
        "/bin",
        "/sbin",
        "/boot",
        "/sys",
        "/proc",
        "/dev",
        "/System",
        "/private/etc",
        "/private/var",
        "C:\\Windows",
        "C:\\Program Files",
        "C:\\Program Files (x86)",
    ];
    let s = path.to_string_lossy();
    for prefix in FORBIDDEN_PREFIXES {
        if s.starts_with(prefix) {
            return Err(format!(
                "save_path is in a protected system location: {}",
                prefix
            ));
        }
    }
    Ok(())
}

/// Accept an incoming file transfer and tell the receive pipeline where
/// the user wants it saved. Looks up the parked oneshot sender in
/// `PendingRequests` and delivers an `Accept { save_path }` decision.
#[command]
pub async fn accept_file_transfer(
    transfer_id: String,
    save_path: String,
    app: AppHandle,
    pending: tauri::State<'_, PendingRequests>,
) -> Result<(), String> {
    let path = PathBuf::from(&save_path);
    validate_save_path(&path)?;
    let mut map = pending.lock().await;
    match map.remove(&transfer_id) {
        Some(tx) => {
            if tx
                .send(FileRequestDecision::Accept {
                    save_path: path.clone(),
                })
                .is_err()
            {
                return Err(format!(
                    "Pending receiver for {} was dropped before accept could be delivered",
                    transfer_id
                ));
            }
            let _ = app.emit(
                "file-transfer-accepted",
                serde_json::json!({ "transfer_id": transfer_id, "save_path": save_path }),
            );
            Ok(())
        }
        None => Err(format!(
            "No pending file request for transfer_id {}",
            transfer_id
        )),
    }
}

/// Reject an incoming file transfer. The receive pipeline writes a
/// FileReject frame back to the sender and closes the TCP connection.
#[command]
pub async fn reject_file_transfer(
    transfer_id: String,
    app: AppHandle,
    pending: tauri::State<'_, PendingRequests>,
) -> Result<(), String> {
    let mut map = pending.lock().await;
    if let Some(tx) = map.remove(&transfer_id) {
        let _ = tx.send(FileRequestDecision::Reject);
    }
    // Always emit — the frontend uses this to clear the pending row even
    // if the reject arrived after the timeout drop.
    let _ = app.emit("file-transfer-rejected", &transfer_id);
    Ok(())
}

// --- Device info ---

#[derive(Debug, Clone, Serialize)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub hostname: String,
    pub ip: String,
    pub os: String,
}

/// Best-effort local IPv4 address via UDP "connect" trick.
/// Opens no packets — just asks the kernel which interface would route
/// to a well-known public IP, then reads back the local_addr it bound.
fn best_effort_local_ip() -> String {
    use std::net::UdpSocket;
    if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
        if sock.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = sock.local_addr() {
                let ip = addr.ip();
                if !ip.is_unspecified() && !ip.is_loopback() {
                    return ip.to_string();
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

// Sync command on purpose: `best_effort_local_ip` uses `std::net::UdpSocket`
// which is blocking — `#[command] fn` (not `async fn`) lets Tauri dispatch
// the call onto a blocking thread instead of parking an async worker.
#[command]
pub fn get_device_info(device: tauri::State<'_, DeviceConfig>) -> Result<DeviceInfo, String> {
    let hostname = hostname::get()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|_| device.device_name.clone());
    Ok(DeviceInfo {
        id: device.device_id.clone(),
        name: device.device_name.clone(),
        hostname,
        ip: best_effort_local_ip(),
        os: std::env::consts::OS.to_string(),
    })
}
