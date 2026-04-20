export { MessageType } from './types'
export type {
  Message,
  TextMessage,
  TextAckMessage,
  FileRequestMessage,
  FileResponseMessage,
  FileDataMessage,
  FileChunkAckMessage,
  FileDoneMessage,
  FileCancelMessage,
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
