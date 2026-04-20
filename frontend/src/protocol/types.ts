/**
 * LAN Messenger Protocol - Message Types
 *
 * Must stay in sync with src-tauri/src/protocol/types.rs
 */

/** Message type identifiers — values match Rust backend */
export enum MessageType {
  // Discovery (UDP)
  Online = 0x01,
  Offline = 0x02,
  Heartbeat = 0x03,
  // Instant messaging (TCP)
  TextMsg = 0x10,
  TextAck = 0x11,
  // File transfer (TCP)
  FileReq = 0x20,
  FileAccept = 0x21,
  FileReject = 0x22,
  FileData = 0x23,
  FileAck = 0x24,
  FileDone = 0x25,
  FileCancel = 0x26,
}

/** Text message (TCP) */
export interface TextMessage {
  msg_type: number
  msg_id: string
  from_id: string
  timestamp: number
  content: string
}

/** Text acknowledgement */
export interface TextAckMessage {
  msg_type: number
  msg_id: string
  status: string
}

/** File transfer request */
export interface FileRequestMessage {
  msg_type: number
  transfer_id: string
  from_id: string
  filename: string
  file_size: number
  checksum: string
  chunk_size: number
  resume_from_seq?: number
}

/** File accept/reject response */
export interface FileResponseMessage {
  msg_type: number
  transfer_id: string
}

/** File data chunk */
export interface FileDataMessage {
  msg_type: number
  transfer_id: string
  seq: number
  data: Uint8Array
}

/** File chunk acknowledgement */
export interface FileChunkAckMessage {
  msg_type: number
  transfer_id: string
  seq: number
  status?: string
}

/** File transfer done */
export interface FileDoneMessage {
  msg_type: number
  transfer_id: string
  checksum: string
}

/** File cancel */
export interface FileCancelMessage {
  msg_type: number
  transfer_id: string
  reason?: string
}

/** Union of all message types */
export type Message =
  | TextMessage
  | TextAckMessage
  | FileRequestMessage
  | FileResponseMessage
  | FileDataMessage
  | FileChunkAckMessage
  | FileDoneMessage
  | FileCancelMessage
