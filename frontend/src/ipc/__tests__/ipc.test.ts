/**
 * IPC Layer - Unit tests
 *
 * These tests verify the type-safety and structure of IPC bindings.
 * Actual invoke/listen calls are mocked since we're not in Tauri runtime.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// Mock @tauri-apps/api/event
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

import { contacts, messages, discovery, fileTransfer, events } from '../index'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

const mockInvoke = invoke as ReturnType<typeof vi.fn>
const mockListen = listen as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('IPC Commands', () => {
  describe('contacts', () => {
    it('getAll calls correct command', async () => {
      mockInvoke.mockResolvedValue([])
      await contacts.getAll()
      expect(mockInvoke).toHaveBeenCalledWith('get_contacts')
    })

    it('getOnline calls correct command', async () => {
      mockInvoke.mockResolvedValue([])
      await contacts.getOnline()
      expect(mockInvoke).toHaveBeenCalledWith('get_online_contacts')
    })

    it('getById passes id parameter', async () => {
      mockInvoke.mockResolvedValue(null)
      await contacts.getById('abc')
      expect(mockInvoke).toHaveBeenCalledWith('get_contact', { id: 'abc' })
    })

    it('delete passes id parameter', async () => {
      mockInvoke.mockResolvedValue(undefined)
      await contacts.delete('abc')
      expect(mockInvoke).toHaveBeenCalledWith('delete_contact', { id: 'abc' })
    })
  })

  describe('messages', () => {
    it('query passes all parameters', async () => {
      mockInvoke.mockResolvedValue([])
      await messages.query('contact-1', 20, 10)
      expect(mockInvoke).toHaveBeenCalledWith('get_messages', {
        contactId: 'contact-1',
        limit: 20,
        offset: 10,
      })
    })

    it('send passes request object', async () => {
      mockInvoke.mockResolvedValue({})
      await messages.send('recipient-1', 'hello')
      expect(mockInvoke).toHaveBeenCalledWith('send_message', {
        request: { recipientId: 'recipient-1', content: 'hello' },
      })
    })
  })

  describe('discovery', () => {
    it('start calls correct command', async () => {
      mockInvoke.mockResolvedValue(undefined)
      await discovery.start()
      expect(mockInvoke).toHaveBeenCalledWith('start_discovery')
    })

    it('getPeers calls correct command', async () => {
      mockInvoke.mockResolvedValue([])
      await discovery.getPeers()
      expect(mockInvoke).toHaveBeenCalledWith('get_discovered_peers')
    })
  })

  describe('fileTransfer', () => {
    it('initiate passes request', async () => {
      mockInvoke.mockResolvedValue('transfer-id')
      await fileTransfer.initiate('recipient', '/path/to/file')
      expect(mockInvoke).toHaveBeenCalledWith('initiate_file_transfer', {
        request: { recipientId: 'recipient', filePath: '/path/to/file' },
      })
    })

    it('accept passes transferId', async () => {
      mockInvoke.mockResolvedValue(undefined)
      await fileTransfer.accept('t-1')
      expect(mockInvoke).toHaveBeenCalledWith('accept_file_transfer', { transferId: 't-1' })
    })
  })
})

describe('IPC Events', () => {
  it('onMessageReceived listens to correct event', async () => {
    mockListen.mockResolvedValue(() => {})
    await events.onMessageReceived(() => {})
    expect(mockListen).toHaveBeenCalledWith('message-received', expect.any(Function))
  })

  it('onPeerFound listens to correct event', async () => {
    mockListen.mockResolvedValue(() => {})
    await events.onPeerFound(() => {})
    expect(mockListen).toHaveBeenCalledWith('peer-found', expect.any(Function))
  })

  it('onPeerLost listens to correct event', async () => {
    mockListen.mockResolvedValue(() => {})
    await events.onPeerLost(() => {})
    expect(mockListen).toHaveBeenCalledWith('peer-lost', expect.any(Function))
  })

  it('onFileTransferProgress listens to correct event', async () => {
    mockListen.mockResolvedValue(() => {})
    await events.onFileTransferProgress(() => {})
    expect(mockListen).toHaveBeenCalledWith('file-transfer-progress', expect.any(Function))
  })
})
