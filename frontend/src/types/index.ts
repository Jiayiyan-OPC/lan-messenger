/** Shared types matching Rust backend structs */

export interface Contact {
  id: string
  name: string
  ip_address: string
  port: number
  online: boolean
  last_seen: number
  created_at: number
}

export interface StoredMessage {
  id: string
  sender_id: string
  recipient_id: string
  content: string
  timestamp: number
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
  file_transfer_id?: string
}

export interface FileTransfer {
  id: string
  message_id: string
  file_name: string
  file_size: number
  checksum: string
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'rejected' | 'failed'
  bytes_transferred: number
  local_path?: string
  created_at: number
  updated_at: number
}

export interface PeerInfo {
  id: string
  name: string
  ip_address: string
  port: number
}

export interface FileTransferProgress {
  transfer_id: string
  progress: number
  bytes_transferred: number
  total_bytes: number
}

/** Tab in main area */
export type ActiveTab = 'chat' | 'files'
