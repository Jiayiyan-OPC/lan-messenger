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
    pendingRequests: [],
    initialized: false,
  })
  vi.clearAllMocks()
})

describe('useTransfersStore', () => {
  it('should send file and add transfer', async () => {
    mockInvoke.mockResolvedValue('tx-001')

    await useTransfersStore.getState().sendFile('recipient', '/path/file.txt')

    expect(useTransfersStore.getState().transfers).toHaveLength(1)
    expect(useTransfersStore.getState().transfers[0]!.id).toBe('tx-001')
  })

  it('should accept transfer', async () => {
    mockInvoke.mockResolvedValue(undefined)
    useTransfersStore.setState({
      pendingRequests: [{ transferId: 'tx-1', fileName: 'f', fileSize: 100, fromId: 'a' }],
      transfers: [makeTransfer('tx-1')],
    })

    await useTransfersStore.getState().acceptTransfer('tx-1')

    expect(useTransfersStore.getState().pendingRequests).toHaveLength(0)
    expect(useTransfersStore.getState().transfers[0]!.status).toBe('accepted')
  })

  it('should reject transfer', async () => {
    mockInvoke.mockResolvedValue(undefined)
    useTransfersStore.setState({
      pendingRequests: [{ transferId: 'tx-1', fileName: 'f', fileSize: 100, fromId: 'a' }],
    })

    await useTransfersStore.getState().rejectTransfer('tx-1')

    expect(useTransfersStore.getState().pendingRequests).toHaveLength(0)
  })

  it('should dismiss pending', () => {
    useTransfersStore.setState({
      pendingRequests: [{ transferId: 'tx-1', fileName: 'f', fileSize: 100, fromId: 'a' }],
    })

    useTransfersStore.getState().dismissPending('tx-1')

    expect(useTransfersStore.getState().pendingRequests).toHaveLength(0)
  })

  it('should cancel an in-flight transfer and clear any matching pending row', () => {
    useTransfersStore.setState({
      transfers: [makeTransfer('tx-1', 'in_progress'), makeTransfer('tx-2', 'pending')],
      pendingRequests: [{ transferId: 'tx-1', fileName: 'f', fileSize: 100, fromId: 'a' }],
    })

    useTransfersStore.getState().cancelTransfer('tx-1')

    const state = useTransfersStore.getState()
    expect(state.transfers).toHaveLength(1)
    expect(state.transfers[0]!.id).toBe('tx-2')
    expect(state.pendingRequests).toHaveLength(0)
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
  it('selectActiveTransfers', () => {
    const state = {
      ...useTransfersStore.getState(),
      transfers: [
        makeTransfer('a', 'in_progress'),
        makeTransfer('b', 'completed'),
        makeTransfer('c', 'pending'),
      ],
    }
    expect(selectActiveTransfers(state)).toHaveLength(2)
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
