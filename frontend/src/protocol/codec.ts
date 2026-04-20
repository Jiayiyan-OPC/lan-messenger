/**
 * LAN Messenger Protocol - Frame Codec
 *
 * Wire format (matches src-tauri/src/protocol/codec.rs):
 *   [MAGIC (2 bytes: 0x4C 0x4D "LM")] [LENGTH (4 bytes, big-endian)] [PAYLOAD (msgpack)]
 */

import { encode, decode } from '@msgpack/msgpack'
import type { Message } from './types'

/** Protocol magic bytes: "LM" — must match Rust FRAME_MAGIC */
export const FRAME_MAGIC = new Uint8Array([0x4c, 0x4d])

/** Header size: 2 (magic) + 4 (length) = 6 bytes */
export const HEADER_SIZE = 6

/** Maximum payload size: 16 MB */
export const MAX_PAYLOAD_SIZE = 16 * 1024 * 1024

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProtocolError'
  }
}

/**
 * Encode a message into a framed binary buffer.
 */
export function encodeFrame(message: Message): Uint8Array {
  const payload = encode(message)

  if (payload.byteLength > MAX_PAYLOAD_SIZE) {
    throw new ProtocolError(
      `Payload size ${payload.byteLength} exceeds maximum ${MAX_PAYLOAD_SIZE}`,
    )
  }

  const frame = new Uint8Array(HEADER_SIZE + payload.byteLength)

  // Write magic (2 bytes)
  frame.set(FRAME_MAGIC, 0)

  // Write length (big-endian uint32 at offset 2)
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
  view.setUint32(2, payload.byteLength, false)

  // Write payload
  frame.set(payload, HEADER_SIZE)

  return frame
}

/**
 * Decode a framed binary buffer into a message.
 * Returns null if buffer doesn't contain a complete frame.
 */
export function decodeFrame(buffer: Uint8Array): { message: Message; bytesConsumed: number } | null {
  if (buffer.byteLength < HEADER_SIZE) {
    return null
  }

  // Verify magic (2 bytes)
  for (let i = 0; i < 2; i++) {
    if (buffer[i] !== FRAME_MAGIC[i]) {
      throw new ProtocolError(
        `Invalid magic at offset ${i}: expected 0x${FRAME_MAGIC[i].toString(16)}, got 0x${buffer[i].toString(16)}`,
      )
    }
  }

  // Read length (4 bytes at offset 2)
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const payloadLength = view.getUint32(2, false)

  if (payloadLength > MAX_PAYLOAD_SIZE) {
    throw new ProtocolError(
      `Payload length ${payloadLength} exceeds maximum ${MAX_PAYLOAD_SIZE}`,
    )
  }

  const totalLength = HEADER_SIZE + payloadLength
  if (buffer.byteLength < totalLength) {
    return null
  }

  const payload = buffer.slice(HEADER_SIZE, totalLength)
  const message = decode(payload) as Message

  return { message, bytesConsumed: totalLength }
}

/**
 * Stream decoder: accumulates bytes and yields complete messages.
 */
export class FrameDecoder {
  private buffer: Uint8Array = new Uint8Array(0)

  feed(data: Uint8Array): Message[] {
    const newBuffer = new Uint8Array(this.buffer.byteLength + data.byteLength)
    newBuffer.set(this.buffer, 0)
    newBuffer.set(data, this.buffer.byteLength)
    this.buffer = newBuffer

    const messages: Message[] = []

    while (this.buffer.byteLength >= HEADER_SIZE) {
      const result = decodeFrame(this.buffer)
      if (result === null) {
        break
      }
      messages.push(result.message)
      this.buffer = this.buffer.slice(result.bytesConsumed)
    }

    return messages
  }

  reset(): void {
    this.buffer = new Uint8Array(0)
  }

  get bufferedBytes(): number {
    return this.buffer.byteLength
  }
}
