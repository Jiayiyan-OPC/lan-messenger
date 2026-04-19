/**
 * Tauri IPC Layer - Frontend bindings for backend commands and events.
 *
 * Type-safe wrappers around `invoke()` and `listen()`.
 */

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { Contact, StoredMessage } from '../storage'

// ============================================================
// Commands (frontend → backend)
// ============================================================

/** Contact commands */
export const contacts = {
  getAll: () => invoke<Contact[]>('get_contacts'),
  getOnline: () => invoke<Contact[]>('get_online_contacts'),
  getById: (id: string) => invoke<Contact | null>('get_contact', { id }),
  delete: (id: string) => invoke<void>('delete_contact', { id }),
}

/** Message commands */
export const messages = {
  query: (contactId?: string, limit?: number, offset?: number) =>
    invoke<StoredMessage[]>('get_messages', { contactId, limit, offset }),
  getById: (id: string) => invoke<StoredMessage | null>('get_message', { id }),
  send: (recipientId: string, content: string) =>
    invoke<StoredMessage>('send_message', { request: { recipientId, content } }),
  delete: (id: string) => invoke<void>('delete_message', { id }),
  deleteByContact: (contactId: string) =>
    invoke<void>('delete_messages_by_contact', { contactId }),
}

/** Discovery commands */
export const discovery = {
  start: () => invoke<void>('start_discovery'),
  stop: () => invoke<void>('stop_discovery'),
  getPeers: () =>
    invoke<Array<{ id: string; name: string; ip_address: string; port: number }>>(
      'get_discovered_peers',
    ),
}

/** File transfer commands */
export const fileTransfer = {
  initiate: (recipientId: string, filePath: string) =>
    invoke<string>('initiate_file_transfer', { request: { recipientId, filePath } }),
  accept: (transferId: string) => invoke<void>('accept_file_transfer', { transferId }),
  reject: (transferId: string) => invoke<void>('reject_file_transfer', { transferId }),
}

// ============================================================
// Events (backend → frontend)
// ============================================================

export interface PeerEvent {
  id: string
  name: string
  ip_address: string
  port: number
}

export interface FileTransferProgress {
  transfer_id: string
  bytes_transferred: number
  total_bytes: number
}

/** Event listeners */
export const events = {
  onMessageReceived: (handler: (msg: StoredMessage) => void): Promise<UnlistenFn> =>
    listen<StoredMessage>('message-received', (e) => handler(e.payload)),

  onMessageSent: (handler: (msg: StoredMessage) => void): Promise<UnlistenFn> =>
    listen<StoredMessage>('message-sent', (e) => handler(e.payload)),

  onPeerFound: (handler: (peer: PeerEvent) => void): Promise<UnlistenFn> =>
    listen<PeerEvent>('peer-found', (e) => handler(e.payload)),

  onPeerLost: (handler: (peerId: string) => void): Promise<UnlistenFn> =>
    listen<string>('peer-lost', (e) => handler(e.payload)),

  onPeerUpdated: (handler: (peer: PeerEvent) => void): Promise<UnlistenFn> =>
    listen<PeerEvent>('peer-updated', (e) => handler(e.payload)),

  onFileTransferProgress: (handler: (progress: FileTransferProgress) => void): Promise<UnlistenFn> =>
    listen<FileTransferProgress>('file-transfer-progress', (e) => handler(e.payload)),

  onFileTransferComplete: (handler: (transferId: string) => void): Promise<UnlistenFn> =>
    listen<string>('file-transfer-complete', (e) => handler(e.payload)),
}
