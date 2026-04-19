export { MessageType } from './types'
export type {
  Message,
  MessageEnvelope,
  TextMessage,
  FileRequestMessage,
  FileDataMessage,
  FileAckMessage,
  PingMessage,
  PongMessage,
  OfflineMessage,
  TypingMessage,
  ReadReceiptMessage,
} from './types'

export {
  FRAME_MAGIC,
  HEADER_SIZE,
  MAX_PAYLOAD_SIZE,
  ProtocolError,
  encodeFrame,
  decodeFrame,
  FrameDecoder,
} from './codec'
