import { describe, it, expect } from 'vitest'
import {
  MessageType,
  encodeFrame,
  decodeFrame,
  FrameDecoder,
  ProtocolError,
  FRAME_MAGIC,
  HEADER_SIZE,
  MAX_PAYLOAD_SIZE,
} from '../index'
import type {
  TextMessage,
  PingMessage,
  PongMessage,
  OfflineMessage,
  TypingMessage,
  ReadReceiptMessage,
  FileRequestMessage,
  FileDataMessage,
  FileAckMessage,
} from '../index'

const baseMeta = {
  senderId: '550e8400-e29b-41d4-a716-446655440000',
  recipientId: '550e8400-e29b-41d4-a716-446655440001',
  timestamp: Date.now(),
  messageId: '660e8400-e29b-41d4-a716-446655440002',
}

describe('Protocol Codec', () => {
  describe('TextMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: TextMessage = {
        ...baseMeta,
        type: MessageType.Text,
        content: 'Hello, LAN!',
      }
      const frame = encodeFrame(msg)
      const result = decodeFrame(frame)
      expect(result).not.toBeNull()
      expect(result!.message).toEqual(msg)
      expect(result!.bytesConsumed).toBe(frame.byteLength)
    })

    it('should handle unicode content', () => {
      const msg: TextMessage = {
        ...baseMeta,
        type: MessageType.Text,
        content: '你好世界 🌍 émojis',
      }
      const frame = encodeFrame(msg)
      const result = decodeFrame(frame)
      expect(result!.message).toEqual(msg)
    })
  })

  describe('PingMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: PingMessage = {
        ...baseMeta,
        type: MessageType.Ping,
        recipientId: '',
        deviceName: 'MacBook Pro',
        port: 9876,
      }
      const frame = encodeFrame(msg)
      const result = decodeFrame(frame)
      expect(result!.message).toEqual(msg)
    })
  })

  describe('PongMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: PongMessage = {
        ...baseMeta,
        type: MessageType.Pong,
        deviceName: 'Windows PC',
        port: 9876,
      }
      const frame = encodeFrame(msg)
      const result = decodeFrame(frame)
      expect(result!.message).toEqual(msg)
    })
  })

  describe('OfflineMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: OfflineMessage = {
        ...baseMeta,
        type: MessageType.Offline,
      }
      const frame = encodeFrame(msg)
      const result = decodeFrame(frame)
      expect(result!.message).toEqual(msg)
    })
  })

  describe('TypingMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: TypingMessage = {
        ...baseMeta,
        type: MessageType.Typing,
        isTyping: true,
      }
      const frame = encodeFrame(msg)
      const result = decodeFrame(frame)
      expect(result!.message).toEqual(msg)
    })
  })

  describe('ReadReceiptMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: ReadReceiptMessage = {
        ...baseMeta,
        type: MessageType.ReadReceipt,
        readMessageIds: ['id-1', 'id-2', 'id-3'],
      }
      const frame = encodeFrame(msg)
      const result = decodeFrame(frame)
      expect(result!.message).toEqual(msg)
    })
  })

  describe('FileRequestMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: FileRequestMessage = {
        ...baseMeta,
        type: MessageType.FileRequest,
        fileName: 'document.pdf',
        fileSize: 1024 * 1024,
        checksum: 'abc123def456',
      }
      const frame = encodeFrame(msg)
      const result = decodeFrame(frame)
      expect(result!.message).toEqual(msg)
    })
  })

  describe('FileDataMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: FileDataMessage = {
        ...baseMeta,
        type: MessageType.FileData,
        fileId: 'file-001',
        chunkIndex: 0,
        totalChunks: 10,
        data: new Uint8Array([1, 2, 3, 4, 5]),
      }
      const frame = encodeFrame(msg)
      const result = decodeFrame(frame)
      const decoded = result!.message as FileDataMessage
      expect(decoded.type).toBe(MessageType.FileData)
      expect(decoded.fileId).toBe('file-001')
      expect(decoded.chunkIndex).toBe(0)
      expect(new Uint8Array(decoded.data)).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
    })
  })

  describe('FileAckMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: FileAckMessage = {
        ...baseMeta,
        type: MessageType.FileAck,
        fileId: 'file-001',
        accepted: true,
      }
      const frame = encodeFrame(msg)
      const result = decodeFrame(frame)
      expect(result!.message).toEqual(msg)
    })
  })

  describe('Frame format', () => {
    it('should have correct magic bytes', () => {
      const msg: TextMessage = { ...baseMeta, type: MessageType.Text, content: 'hi' }
      const frame = encodeFrame(msg)
      expect(frame.slice(0, 4)).toEqual(FRAME_MAGIC)
    })

    it('should have correct length in header', () => {
      const msg: TextMessage = { ...baseMeta, type: MessageType.Text, content: 'hi' }
      const frame = encodeFrame(msg)
      const view = new DataView(frame.buffer, frame.byteOffset)
      const length = view.getUint32(4, false)
      expect(length).toBe(frame.byteLength - HEADER_SIZE)
    })

    it('should return null for incomplete buffer', () => {
      const msg: TextMessage = { ...baseMeta, type: MessageType.Text, content: 'hi' }
      const frame = encodeFrame(msg)
      // Only give half
      expect(decodeFrame(frame.slice(0, HEADER_SIZE + 2))).toBeNull()
    })

    it('should return null for buffer smaller than header', () => {
      expect(decodeFrame(new Uint8Array(4))).toBeNull()
    })

    it('should throw on invalid magic', () => {
      const frame = new Uint8Array(HEADER_SIZE + 4)
      frame.set([0x00, 0x00, 0x00, 0x00], 0) // bad magic
      expect(() => decodeFrame(frame)).toThrow(ProtocolError)
    })

    it('should throw on oversized payload length', () => {
      const frame = new Uint8Array(HEADER_SIZE)
      frame.set(FRAME_MAGIC, 0)
      const view = new DataView(frame.buffer)
      view.setUint32(4, MAX_PAYLOAD_SIZE + 1, false)
      expect(() => decodeFrame(frame)).toThrow(ProtocolError)
    })
  })

  describe('FrameDecoder (streaming)', () => {
    it('should decode multiple messages from chunked data', () => {
      const msg1: TextMessage = { ...baseMeta, type: MessageType.Text, content: 'first' }
      const msg2: TextMessage = { ...baseMeta, type: MessageType.Text, content: 'second' }
      const frame1 = encodeFrame(msg1)
      const frame2 = encodeFrame(msg2)

      const combined = new Uint8Array(frame1.byteLength + frame2.byteLength)
      combined.set(frame1, 0)
      combined.set(frame2, frame1.byteLength)

      const decoder = new FrameDecoder()
      // Feed in small chunks
      const chunkSize = 10
      const allMessages: any[] = []
      for (let i = 0; i < combined.byteLength; i += chunkSize) {
        const chunk = combined.slice(i, Math.min(i + chunkSize, combined.byteLength))
        allMessages.push(...decoder.feed(chunk))
      }

      expect(allMessages).toHaveLength(2)
      expect(allMessages[0]).toEqual(msg1)
      expect(allMessages[1]).toEqual(msg2)
    })

    it('should reset properly', () => {
      const decoder = new FrameDecoder()
      decoder.feed(new Uint8Array([0x4c, 0x4d])) // partial magic
      expect(decoder.bufferedBytes).toBe(2)
      decoder.reset()
      expect(decoder.bufferedBytes).toBe(0)
    })
  })
})
