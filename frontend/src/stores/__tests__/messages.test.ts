import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

import { invoke } from '@tauri-apps/api/core'
import { useMessagesStore, selectMessages } from '../messages'
import type { StoredMessage } from '../../types'

const mockInvoke = invoke as ReturnType<typeof vi.fn>

const makeMsg = (id: string, senderId = 'a', recipientId = 'b'): StoredMessage => ({
  id,
  sender_id: senderId,
  recipient_id: recipientId,
  content: `Message ${id}`,
  timestamp: Date.now(),
  status: 'sent',
})

beforeEach(() => {
  useMessagesStore.setState({
    messagesByContact: {},
    sending: false,
    initialized: false,
  })
  vi.clearAllMocks()
})

describe('useMessagesStore', () => {
  it('should load messages for a contact', async () => {
    const msgs = [makeMsg('m1'), makeMsg('m2')]
    mockInvoke.mockResolvedValue(msgs)

    await useMessagesStore.getState().loadMessages('contact-1')

    const stored = useMessagesStore.getState().messagesByContact['contact-1']
    expect(stored).toHaveLength(2)
  })

  it('should send message', async () => {
    const sent = makeMsg('m1', 'me', 'contact-1')
    mockInvoke.mockResolvedValue(sent)

    await useMessagesStore.getState().sendMessage('contact-1', 'hello')

    const stored = useMessagesStore.getState().messagesByContact['contact-1']
    expect(stored).toHaveLength(1)
    expect(stored![0]!.content).toBe('Message m1')
    expect(useMessagesStore.getState().sending).toBe(false)
  })

  it('should set sending=false even on error', async () => {
    mockInvoke.mockRejectedValue(new Error('fail'))

    await expect(
      useMessagesStore.getState().sendMessage('contact-1', 'hello'),
    ).rejects.toThrow()

    expect(useMessagesStore.getState().sending).toBe(false)
  })
})

describe('selectMessages', () => {
  it('returns messages for contact', () => {
    const state = {
      ...useMessagesStore.getState(),
      messagesByContact: { 'c1': [makeMsg('m1')] },
    }
    expect(selectMessages('c1')(state)).toHaveLength(1)
  })

  it('returns empty for unknown contact', () => {
    expect(selectMessages('unknown')(useMessagesStore.getState())).toEqual([])
  })

  it('returns empty for null contact', () => {
    expect(selectMessages(null)(useMessagesStore.getState())).toEqual([])
  })
})
