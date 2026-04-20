/** Shared types matching Rust backend structs */

export interface Contact {
  id: string
  name: string
  ip_address: string
  port: number
  online: boolean
  last_seen: number
  created_at: number
  /** Optional — not populated until backend discovery packet includes it. */
  os?: string
  /** Optional hostname; backend currently reuses `name` for display. */
  hostname?: string
}

export interface StoredMessage {
  id: string
  sender_id: string
  recipient_id: string
  content: string
  timestamp: number
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'received'
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
  /** 'out' when we sent it, 'in' when receiving. */
  direction?: 'in' | 'out'
  /** Peer id on the other end of the transfer. */
  peer_id?: string
  local_path?: string
  created_at: number
  updated_at: number
}

export interface PeerInfo {
  id: string
  name: string
  ip_address: string
  port: number
  os?: string
  hostname?: string
}

export interface FileTransferProgress {
  transfer_id: string
  progress: number
  bytes_transferred: number
  total_bytes: number
}

export interface DeviceInfo {
  id: string
  name: string
  hostname: string
  ip: string
  os: string
}

export type ToastKind = 'info' | 'success' | 'file' | 'peer'

export interface Toast {
  id: string
  kind: ToastKind
  title: string
  body?: string
  durationMs?: number
}

export type SidebarTab = 'chats' | 'devices'
export type DetailTab = 'files' | 'info'

/** Legacy: retained for backward-compat with stores/app test. Not used by UI. */
export type ActiveTab = 'chat' | 'files'
