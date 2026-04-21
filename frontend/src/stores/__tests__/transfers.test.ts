import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

import { invoke } from '@tauri-apps/api/core'
import {
  useTransfersStore,
  selectActiveTransfers,
  selectCompletedTransfers,
} from '../transfers'
import { useMessagesStore } from '../messages'
import type { FileTransfer } from '../../types'

const mockInvoke = invoke as ReturnType<typeof vi.fn>

const makeTransfer = (id: string, status: FileTransfer['status'] = 'pending'): FileTransfer => ({
  id,
  message_id: '',
  file_name: 'test.txt',
  file_size: 1024,
  checksum: '',
  status,
  bytes_transferred: 0,
  created_at: Date.now(),
  updated_at: Date.now(),
})

beforeEach(() => {
  useTransfersStore.setState({
    transfers: [],
    initialized: false,
  })
  useMessagesStore.setState({
    messagesByContact: {},
    sending: false,
    initialized: false,
  })
  vi.clearAllMocks()
})

describe('useTransfersStore', () => {
  it('should send file and add transfer', async () => {
    mockInvoke.mockResolvedValue({
      transfer_id: 'tx-001',
      file_name: 'file.txt',
      file_size: 1234,
    })

    await useTransfersStore.getState().sendFile('recipient', '/path/file.txt')

    expect(useTransfersStore.getState().transfers).toHaveLength(1)
    const t = useTransfersStore.getState().transfers[0]!
    expect(t.id).toBe('tx-001')
    expect(t.direction).toBe('out')
    expect(t.file_name).toBe('file.txt')
    expect(t.file_size).toBe(1234)
  })

  it('sendFile also seeds an outgoing chat message so the sender renders a FileBubble', async () => {
    mockInvoke.mockResolvedValue({
      transfer_id: 'tx-002',
      file_name: 'pic.png',
      file_size: 42,
    })

    await useTransfersStore.getState().sendFile('recipient-7', '/tmp/pic.png')

    const list = useMessagesStore.getState().messagesByContact['recipient-7']
    expect(list).toBeDefined()
    expect(list).toHaveLength(1)
    expect(list![0]!).toMatchObject({
      id: 'tx-002',
      file_transfer_id: 'tx-002',
      recipient_id: 'recipient-7',
      content: 'pic.png',
    })
  })

  it('acceptIncoming invokes accept_file_transfer with savePath and flips status', async () => {
    mockInvoke.mockResolvedValue(undefined)
    useTransfersStore.setState({
      transfers: [makeTransfer('tx-1', 'pending_response')],
    })

    await useTransfersStore.getState().acceptIncoming('tx-1', '/tmp/out.txt')

    expect(mockInvoke).toHaveBeenCalledWith(
      'accept_file_transfer',
      expect.objectContaining({ transferId: 'tx-1', savePath: '/tmp/out.txt' }),
    )
    const t = useTransfersStore.getState().transfers[0]!
    expect(t.status).toBe('accepted')
    expect(t.local_path).toBe('/tmp/out.txt')
  })

  it('rejectIncoming invokes reject_file_transfer and flips status', async () => {
    mockInvoke.mockResolvedValue(undefined)
    useTransfersStore.setState({
      transfers: [makeTransfer('tx-1', 'pending_response')],
    })

    await useTransfersStore.getState().rejectIncoming('tx-1')

    expect(mockInvoke).toHaveBeenCalledWith(
      'reject_file_transfer',
      expect.objectContaining({ transferId: 'tx-1' }),
    )
    expect(useTransfersStore.getState().transfers[0]!.status).toBe('rejected')
  })

  it('cancelTransfer drops the row locally', () => {
    useTransfersStore.setState({
      transfers: [makeTransfer('tx-1', 'in_progress'), makeTransfer('tx-2', 'pending')],
    })

    useTransfersStore.getState().cancelTransfer('tx-1')

    const state = useTransfersStore.getState()
    expect(state.transfers).toHaveLength(1)
    expect(state.transfers[0]!.id).toBe('tx-2')
  })

  it('cancelTransfer is a no-op for unknown ids', () => {
    useTransfersStore.setState({
      transfers: [makeTransfer('tx-1', 'in_progress')],
    })

    useTransfersStore.getState().cancelTransfer('nope')

    expect(useTransfersStore.getState().transfers).toHaveLength(1)
  })
})

describe('selectors', () => {
  it('selectActiveTransfers includes pending_response', () => {
    const state = {
      ...useTransfersStore.getState(),
      transfers: [
        makeTransfer('a', 'in_progress'),
        makeTransfer('b', 'completed'),
        makeTransfer('c', 'pending'),
        makeTransfer('d', 'pending_response'),
      ],
    }
    expect(selectActiveTransfers(state)).toHaveLength(3)
  })

  it('selectCompletedTransfers', () => {
    const state = {
      ...useTransfersStore.getState(),
      transfers: [
        makeTransfer('a', 'completed'),
        makeTransfer('b', 'failed'),
        makeTransfer('c', 'in_progress'),
      ],
    }
    expect(selectCompletedTransfers(state)).toHaveLength(2)
  })
})
