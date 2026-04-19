/**
 * Storage Layer - Type Definitions
 *
 * Database schema types for contacts, messages, and file transfers.
 */

/** Contact/Device record */
export interface Contact {
  /** Device UUID */
  id: string
  /** Display name */
  name: string
  /** Last known IP address */
  ipAddress: string
  /** Service port */
  port: number
  /** Whether currently online */
  online: boolean
  /** Last seen timestamp (Unix ms) */
  lastSeen: number
  /** Record creation time */
  createdAt: number
}

/** Message delivery status */
export enum DeliveryStatus {
  Sending = 'sending',
  Sent = 'sent',
  Delivered = 'delivered',
  Read = 'read',
  Failed = 'failed',
}

/** Stored chat message */
export interface StoredMessage {
  /** Message UUID */
  id: string
  /** Sender device ID */
  senderId: string
  /** Recipient device ID */
  recipientId: string
  /** Message content (text) */
  content: string
  /** Unix timestamp ms */
  timestamp: number
  /** Delivery status */
  status: DeliveryStatus
  /** Associated file transfer ID (if any) */
  fileTransferId?: string
}

/** File transfer status */
export enum TransferStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  InProgress = 'in_progress',
  Completed = 'completed',
  Rejected = 'rejected',
  Failed = 'failed',
}

/** File transfer record */
export interface FileTransfer {
  /** Transfer UUID */
  id: string
  /** Associated message ID */
  messageId: string
  /** File name */
  fileName: string
  /** File size in bytes */
  fileSize: number
  /** SHA-256 checksum */
  checksum: string
  /** Transfer status */
  status: TransferStatus
  /** Bytes transferred so far */
  bytesTransferred: number
  /** Local file path (after download) */
  localPath?: string
  /** Created timestamp */
  createdAt: number
  /** Updated timestamp */
  updatedAt: number
}

/** Query options for message listing */
export interface MessageQuery {
  /** Filter by contact ID (either sender or recipient) */
  contactId?: string
  /** Limit results */
  limit?: number
  /** Offset for pagination */
  offset?: number
  /** Messages before this timestamp */
  before?: number
  /** Messages after this timestamp */
  after?: number
}
