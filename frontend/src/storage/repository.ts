/**
 * Storage Layer - Repository Interface
 *
 * Abstract interface for storage operations. Implementation lives in Rust (Tauri backend),
 * accessed via IPC. This interface is used for type-safety and testing with in-memory mocks.
 */

import type { Contact, StoredMessage, FileTransfer, MessageQuery } from './types'

export interface ContactRepository {
  /** Upsert a contact (insert or update by ID) */
  upsert(contact: Contact): Promise<void>
  /** Get contact by ID */
  getById(id: string): Promise<Contact | null>
  /** Get all contacts */
  getAll(): Promise<Contact[]>
  /** Get online contacts */
  getOnline(): Promise<Contact[]>
  /** Delete contact */
  delete(id: string): Promise<void>
  /** Update online status */
  setOnline(id: string, online: boolean): Promise<void>
}

export interface MessageRepository {
  /** Insert a new message */
  insert(message: StoredMessage): Promise<void>
  /** Get message by ID */
  getById(id: string): Promise<StoredMessage | null>
  /** Query messages with filters */
  query(options: MessageQuery): Promise<StoredMessage[]>
  /** Update message delivery status */
  updateStatus(id: string, status: StoredMessage['status']): Promise<void>
  /** Delete a message */
  delete(id: string): Promise<void>
  /** Delete all messages for a contact */
  deleteByContact(contactId: string): Promise<void>
}

export interface FileTransferRepository {
  /** Insert a new file transfer record */
  insert(transfer: FileTransfer): Promise<void>
  /** Get transfer by ID */
  getById(id: string): Promise<FileTransfer | null>
  /** Update transfer status and progress */
  updateProgress(id: string, bytesTransferred: number, status: FileTransfer['status']): Promise<void>
  /** Set local path after download */
  setLocalPath(id: string, localPath: string): Promise<void>
  /** Get transfers by message ID */
  getByMessageId(messageId: string): Promise<FileTransfer | null>
}

/** Combined storage interface */
export interface Storage {
  contacts: ContactRepository
  messages: MessageRepository
  fileTransfers: FileTransferRepository
  /** Initialize database (create tables, run migrations) */
  initialize(): Promise<void>
  /** Close database connection */
  close(): Promise<void>
}
