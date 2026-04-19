use serde::{Deserialize, Serialize};

/// Message type identifiers matching the protocol spec.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum MessageType {
    // Discovery (UDP)
    Online = 0x01,
    Offline = 0x02,
    Heartbeat = 0x03,
    // Instant messaging (TCP:2426)
    TextMsg = 0x10,
    TextAck = 0x11,
    // File transfer (TCP:2427)
    FileReq = 0x20,
    FileAccept = 0x21,
    FileReject = 0x22,
    FileData = 0x23,
    FileAck = 0x24,
    FileDone = 0x25,
    FileCancel = 0x26,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextMessage {
    pub msg_type: u8,
    pub msg_id: String,
    pub from_id: String,
    pub timestamp: u64,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextAck {
    pub msg_type: u8,
    pub msg_id: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRequest {
    pub msg_type: u8,
    pub transfer_id: String,
    pub from_id: String,
    pub filename: String,
    pub file_size: u64,
    pub checksum: String,
    pub chunk_size: u32,
    pub resume_from_seq: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileResponse {
    pub msg_type: u8,
    pub transfer_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileData {
    pub msg_type: u8,
    pub transfer_id: String,
    pub seq: u32,
    #[serde(with = "serde_bytes")]
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChunkAck {
    pub msg_type: u8,
    pub transfer_id: String,
    pub seq: u32,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDone {
    pub msg_type: u8,
    pub transfer_id: String,
    pub checksum: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileCancel {
    pub msg_type: u8,
    pub transfer_id: String,
    pub reason: Option<String>,
}
