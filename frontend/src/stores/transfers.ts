import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import { fileTransfer as api } from '../api/fileTransfer'
import type { FileTransfer, FileTransferProgress } from '../types'

interface TransfersState {
  transfers: FileTransfer[]
  pendingRequests: Array<{ transferId: string; fileName: string; fileSize: number; fromId: string }>
  initialized: boolean

  init: () => Promise<void>
  sendFile: (recipientId: string, filePath: string) => Promise<void>
  acceptTransfer: (transferId: string) => Promise<void>
  rejectTransfer: (transferId: string) => Promise<void>
  /** Cancel an in-flight transfer. Today this is local-only: the Rust side
   *  does not yet expose `cancel_file_transfer`, so we simply drop the row
   *  from the store and notify the user. Wire through once the command lands. */
  cancelTransfer: (transferId: string) => void
  dismissPending: (transferId: string) => void
}

export const useTransfersStore = create<TransfersState>((set, get) => ({
  transfers: [],
  pendingRequests: [],
  initialized: false,

  init: async () => {
    if (get().initialized) return
    set({ initialized: true })

    listen<FileTransferProgress>('file-transfer-progress', (e) => {
      const { transfer_id, bytes_transferred } = e.payload
      set((s) => ({
        transfers: s.transfers.map((t) =>
          t.id === transfer_id
            ? { ...t, bytes_transferred, status: 'in_progress' as const }
            : t,
        ),
      }))
    })

    listen<{ transfer_id: string }>('file-transfer-complete', (e) => {
      set((s) => ({
        transfers: s.transfers.map((t) =>
          t.id === e.payload.transfer_id
            ? { ...t, status: 'completed' as const }
            : t,
        ),
      }))
    })

    listen<{ transfer_id: string; reason: string }>('transfer-failed', (e) => {
      set((s) => ({
        transfers: s.transfers.map((t) =>
          t.id === e.payload.transfer_id
            ? { ...t, status: 'failed' as const }
            : t,
        ),
      }))
    })

    listen<{ transfer_id: string; file_name: string; file_size: number; from_id: string }>(
      'file-request',
      (e) => {
        set((s) => ({
          pendingRequests: [
            ...s.pendingRequests,
            {
              transferId: e.payload.transfer_id,
              fileName: e.payload.file_name,
              fileSize: e.payload.file_size,
              fromId: e.payload.from_id,
            },
          ],
        }))
      },
    )
  },

  sendFile: async (recipientId, filePath) => {
    const transferId = await api.initiate(recipientId, filePath)
    set((s) => ({
      transfers: [
        ...s.transfers,
        {
          id: transferId,
          message_id: '',
          file_name: filePath.split('/').pop() ?? filePath,
          file_size: 0,
          checksum: '',
          status: 'pending' as const,
          bytes_transferred: 0,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
    }))
  },

  acceptTransfer: async (transferId) => {
    await api.accept(transferId)
    set((s) => ({
      pendingRequests: s.pendingRequests.filter((r) => r.transferId !== transferId),
      transfers: s.transfers.map((t) =>
        t.id === transferId ? { ...t, status: 'accepted' as const } : t,
      ),
    }))
  },

  rejectTransfer: async (transferId) => {
    await api.reject(transferId)
    set((s) => ({
      pendingRequests: s.pendingRequests.filter((r) => r.transferId !== transferId),
    }))
  },

  cancelTransfer: (transferId) => {
    // TODO(backend): wire to `cancel_file_transfer` Tauri command once the
    // Rust side supports it. Today this only drops the row locally — the
    // remote write loop keeps running until the transfer naturally finishes.
    set((s) => ({
      transfers: s.transfers.filter((t) => t.id !== transferId),
      pendingRequests: s.pendingRequests.filter((r) => r.transferId !== transferId),
    }))
  },

  dismissPending: (transferId) => {
    set((s) => ({
      pendingRequests: s.pendingRequests.filter((r) => r.transferId !== transferId),
    }))
  },
}))

// Selectors
export const selectActiveTransfers = (s: TransfersState) =>
  s.transfers.filter((t) => t.status === 'in_progress' || t.status === 'pending' || t.status === 'accepted')

export const selectCompletedTransfers = (s: TransfersState) =>
  s.transfers.filter((t) => t.status === 'completed' || t.status === 'failed' || t.status === 'rejected')
