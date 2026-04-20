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
  TextAckMessage,
  FileRequestMessage,
  FileDataMessage,
  FileResponseMessage,
  FileChunkAckMessage,
  FileDoneMessage,
  FileCancelMessage,
} from '../index'

describe('Protocol Codec', () => {
  describe('TextMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: TextMessage = {
        msg_type: MessageType.TextMsg,
        msg_id: 'msg-001',
        from_id: 'device-1',
        timestamp: Date.now(),
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
        msg_type: MessageType.TextMsg,
        msg_id: 'msg-002',
        from_id: 'device-1',
        timestamp: Date.now(),
        content: '你好世界 🌍 émojis',
      }
      const frame = encodeFrame(msg)
      const result = decodeFrame(frame)
      expect(result!.message).toEqual(msg)
    })
  })

  describe('TextAckMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: TextAckMessage = {
        msg_type: MessageType.TextAck,
        msg_id: 'msg-001',
        status: 'delivered',
      }
      const frame = encodeFrame(msg)
      const result = decodeFrame(frame)
      expect(result!.message).toEqual(msg)
    })
  })

  describe('FileRequestMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: FileRequestMessage = {
        msg_type: MessageType.FileReq,
        transfer_id: 'tx-001',
        from_id: 'device-1',
        filename: 'document.pdf',
        file_size: 1024 * 1024,
        checksum: 'sha256-abc123',
        chunk_size: 65536,
      }
      const frame = encodeFrame(msg)
      const result = decodeFrame(frame)
      expect(result!.message).toEqual(msg)
    })
  })

  describe('FileDataMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: FileDataMessage = {
        msg_type: MessageType.FileData,
        transfer_id: 'tx-001',
        seq: 0,
        data: new Uint8Array([1, 2, 3, 4, 5]),
      }
      const frame = encodeFrame(msg)
      const result = decodeFrame(frame)
      const decoded = result!.message as FileDataMessage
      expect(decoded.msg_type).toBe(MessageType.FileData)
      expect(decoded.transfer_id).toBe('tx-001')
      expect(decoded.seq).toBe(0)
      expect(new Uint8Array(decoded.data)).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
    })
  })

  describe('FileResponseMessage', () => {
    it('should encode and decode accept', () => {
      const msg: FileResponseMessage = {
        msg_type: MessageType.FileAccept,
        transfer_id: 'tx-001',
      }
      const frame = encodeFrame(msg)
      const result = decodeFrame(frame)
      expect(result!.message).toEqual(msg)
    })

    it('should encode and decode reject', () => {
      const msg: FileResponseMessage = {
        msg_type: MessageType.FileReject,
        transfer_id: 'tx-001',
      }
      const frame = encodeFrame(msg)
      expect(decodeFrame(frame)!.message).toEqual(msg)
    })
  })

  describe('FileChunkAckMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: FileChunkAckMessage = {
        msg_type: MessageType.FileAck,
        transfer_id: 'tx-001',
        seq: 5,
        status: 'ok',
      }
      const frame = encodeFrame(msg)
      expect(decodeFrame(frame)!.message).toEqual(msg)
    })
  })

  describe('FileDoneMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: FileDoneMessage = {
        msg_type: MessageType.FileDone,
        transfer_id: 'tx-001',
        checksum: 'sha256-final',
      }
      const frame = encodeFrame(msg)
      expect(decodeFrame(frame)!.message).toEqual(msg)
    })
  })

  describe('FileCancelMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: FileCancelMessage = {
        msg_type: MessageType.FileCancel,
        transfer_id: 'tx-001',
        reason: 'user cancelled',
      }
      const frame = encodeFrame(msg)
      expect(decodeFrame(frame)!.message).toEqual(msg)
    })
  })

  describe('Frame format', () => {
    it('should have correct magic bytes (2 bytes: LM)', () => {
      const msg: TextMessage = {
        msg_type: MessageType.TextMsg,
        msg_id: 'x',
        from_id: 'y',
        timestamp: 0,
        content: 'hi',
      }
      const frame = encodeFrame(msg)
      expect(frame.slice(0, 2)).toEqual(FRAME_MAGIC)
      expect(frame[0]).toBe(0x4c) // 'L'
      expect(frame[1]).toBe(0x4d) // 'M'
    })

    it('should have correct length in header (offset 2, 4 bytes BE)', () => {
      const msg: TextMessage = {
        msg_type: MessageType.TextMsg,
        msg_id: 'x',
        from_id: 'y',
        timestamp: 0,
        content: 'hi',
      }
      const frame = encodeFrame(msg)
      const view = new DataView(frame.buffer, frame.byteOffset)
      const length = view.getUint32(2, false)
      expect(length).toBe(frame.byteLength - HEADER_SIZE)
    })

    it('should return null for incomplete buffer', () => {
      const msg: TextMessage = {
        msg_type: MessageType.TextMsg,
        msg_id: 'x',
        from_id: 'y',
        timestamp: 0,
        content: 'hi',
      }
      const frame = encodeFrame(msg)
      expect(decodeFrame(frame.slice(0, HEADER_SIZE + 2))).toBeNull()
    })

    it('should return null for buffer smaller than header', () => {
      expect(decodeFrame(new Uint8Array(4))).toBeNull()
    })

    it('should throw on invalid magic', () => {
      const frame = new Uint8Array(HEADER_SIZE + 4)
      frame.set([0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 0)
      expect(() => decodeFrame(frame)).toThrow(ProtocolError)
    })

    it('should throw on oversized payload length', () => {
      const frame = new Uint8Array(HEADER_SIZE)
      frame.set(FRAME_MAGIC, 0)
      const view = new DataView(frame.buffer)
      view.setUint32(2, MAX_PAYLOAD_SIZE + 1, false)
      expect(() => decodeFrame(frame)).toThrow(ProtocolError)
    })
  })

  describe('FrameDecoder (streaming)', () => {
    it('should decode multiple messages from chunked data', () => {
      const msg1: TextMessage = {
        msg_type: MessageType.TextMsg,
        msg_id: 'm1',
        from_id: 'd1',
        timestamp: 1,
        content: 'first',
      }
      const msg2: TextMessage = {
        msg_type: MessageType.TextMsg,
        msg_id: 'm2',
        from_id: 'd1',
        timestamp: 2,
        content: 'second',
      }
      const frame1 = encodeFrame(msg1)
      const frame2 = encodeFrame(msg2)

      const combined = new Uint8Array(frame1.byteLength + frame2.byteLength)
      combined.set(frame1, 0)
      combined.set(frame2, frame1.byteLength)

      const decoder = new FrameDecoder()
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
      decoder.feed(new Uint8Array([0x4c, 0x4d]))
      expect(decoder.bufferedBytes).toBe(2)
      decoder.reset()
      expect(decoder.bufferedBytes).toBe(0)
    })
  })
})
