/**
 * LAN Messenger Protocol - Message Types
 *
 * All message types exchanged between peers.
 */

/** Message type identifiers */
export enum MessageType {
  /** Text chat message */
  Text = 0x01,
  /** File transfer request */
  FileRequest = 0x02,
  /** File transfer data chunk */
  FileData = 0x03,
  /** File transfer acknowledgement */
  FileAck = 0x04,
  /** Device discovery ping */
  Ping = 0x10,
  /** Device discovery pong */
  Pong = 0x11,
  /** Device going offline */
  Offline = 0x12,
  /** Typing indicator */
  Typing = 0x20,
  /** Read receipt */
  ReadReceipt = 0x21,
}

/** Base message envelope */
export interface MessageEnvelope {
  /** Message type */
  type: MessageType
  /** Sender device ID (UUID) */
  senderId: string
  /** Recipient device ID (UUID), empty for broadcast */
  recipientId: string
  /** Unix timestamp in ms */
  timestamp: number
  /** Unique message ID (UUID) */
  messageId: string
}

/** Text message payload */
export interface TextMessage extends MessageEnvelope {
  type: MessageType.Text
  content: string
}

/** File transfer request */
export interface FileRequestMessage extends MessageEnvelope {
  type: MessageType.FileRequest
  fileName: string
  fileSize: number
  checksum: string // SHA-256
}

/** File data chunk */
export interface FileDataMessage extends MessageEnvelope {
  type: MessageType.FileData
  fileId: string
  chunkIndex: number
  totalChunks: number
  data: Uint8Array
}

/** File ack */
export interface FileAckMessage extends MessageEnvelope {
  type: MessageType.FileAck
  fileId: string
  accepted: boolean
}

/** Discovery ping */
export interface PingMessage extends MessageEnvelope {
  type: MessageType.Ping
  deviceName: string
  port: number
}

/** Discovery pong */
export interface PongMessage extends MessageEnvelope {
  type: MessageType.Pong
  deviceName: string
  port: number
}

/** Offline notification */
export interface OfflineMessage extends MessageEnvelope {
  type: MessageType.Offline
}

/** Typing indicator */
export interface TypingMessage extends MessageEnvelope {
  type: MessageType.Typing
  isTyping: boolean
}

/** Read receipt */
export interface ReadReceiptMessage extends MessageEnvelope {
  type: MessageType.ReadReceipt
  readMessageIds: string[]
}

/** Union of all message types */
export type Message =
  | TextMessage
  | FileRequestMessage
  | FileDataMessage
  | FileAckMessage
  | PingMessage
  | PongMessage
  | OfflineMessage
  | TypingMessage
  | ReadReceiptMessage
