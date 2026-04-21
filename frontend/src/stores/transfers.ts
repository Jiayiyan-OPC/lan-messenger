import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import { fileTransfer as api } from '../api/fileTransfer'
import { useMessagesStore } from './messages'
import type { FileTransfer, FileTransferProgress, StoredMessage } from '../types'

interface TransfersState {
  transfers: FileTransfer[]
  initialized: boolean

  init: () => Promise<void>
  /** Outgoing: start sending a file to a peer. */
  sendFile: (recipientId: string, filePath: string) => Promise<void>
  /** Incoming: accept with a user-chosen save path. */
  acceptIncoming: (transferId: string, savePath: string) => Promise<void>
  /** Incoming: reject. */
  rejectIncoming: (transferId: string) => Promise<void>
  /** Cancel an in-flight transfer (local-only until Rust command lands). */
  cancelTransfer: (transferId: string) => void
}

function upsertTransfer(
  list: FileTransfer[],
  id: string,
  updater: (t: FileTransfer) => FileTransfer,
): FileTransfer[] {
  let changed = false
  const next = list.map((t) => {
    if (t.id !== id) return t
    changed = true
    return updater(t)
  })
  return changed ? next : list
}

export const useTransfersStore = create<TransfersState>((set, get) => ({
  transfers: [],
  initialized: false,

  init: async () => {
    if (get().initialized) return
    set({ initialized: true })

    listen<FileTransferProgress>('file-transfer-progress', (e) => {
      const { transfer_id, bytes_transferred } = e.payload
      set((s) => ({
        transfers: upsertTransfer(s.transfers, transfer_id, (t) => ({
          ...t,
          bytes_transferred,
          status: 'in_progress' as const,
          updated_at: Date.now(),
        })),
      }))
    })

    listen<{ transfer_id: string }>('file-transfer-complete', (e) => {
      set((s) => ({
        transfers: upsertTransfer(s.transfers, e.payload.transfer_id, (t) => ({
          ...t,
          status: 'completed' as const,
          updated_at: Date.now(),
        })),
      }))
    })

    listen<{ transfer_id: string; reason: string }>('transfer-failed', (e) => {
      set((s) => ({
        transfers: upsertTransfer(s.transfers, e.payload.transfer_id, (t) => ({
          ...t,
          status: 'failed' as const,
          updated_at: Date.now(),
        })),
      }))
    })

    // Inbound request: seed a `pending_response` transfer + a synthetic
    // received message so the chat renders a FileBubble card. The user
    // then picks a save path from the bubble itself (native save dialog),
    // which resolves the backend's pending oneshot.
    listen<{ transfer_id: string; file_name: string; file_size: number; from_id: string }>(
      'file-request',
      (e) => {
        const { transfer_id, file_name, file_size, from_id } = e.payload
        const now = Date.now()

        set((s) => {
          if (s.transfers.some((t) => t.id === transfer_id)) return s
          const incoming: FileTransfer = {
            id: transfer_id,
            message_id: transfer_id,
            file_name,
            file_size,
            checksum: '',
            status: 'pending_response',
            bytes_transferred: 0,
            direction: 'in',
            peer_id: from_id,
            created_at: now,
            updated_at: now,
          }
          return { transfers: [...s.transfers, incoming] }
        })

        const msg: StoredMessage = {
          id: transfer_id,
          sender_id: from_id,
          recipient_id: 'self',
          content: file_name,
          timestamp: now,
          status: 'received',
          file_transfer_id: transfer_id,
        }
        useMessagesStore.setState((ms) => {
          const existing = ms.messagesByContact[from_id] ?? []
          if (existing.some((m) => m.id === transfer_id)) return ms
          return {
            messagesByContact: {
              ...ms.messagesByContact,
              [from_id]: [...existing, msg],
            },
          }
        })
      },
    )
  },

  sendFile: async (recipientId, filePath) => {
    const transferId = await api.initiate(recipientId, filePath)
    const now = Date.now()
    set((s) => ({
      transfers: [
        ...s.transfers,
        {
          id: transferId,
          message_id: '',
          file_name: filePath.split('/').pop() ?? filePath,
          file_size: 0,
          checksum: '',
          status: 'pending',
          bytes_transferred: 0,
          direction: 'out',
          peer_id: recipientId,
          created_at: now,
          updated_at: now,
        },
      ],
    }))
  },

  acceptIncoming: async (transferId, savePath) => {
    await api.accept(transferId, savePath)
    set((s) => ({
      transfers: upsertTransfer(s.transfers, transferId, (t) => ({
        ...t,
        status: 'accepted' as const,
        local_path: savePath,
        updated_at: Date.now(),
      })),
    }))
  },

  rejectIncoming: async (transferId) => {
    await api.reject(transferId)
    set((s) => ({
      transfers: upsertTransfer(s.transfers, transferId, (t) => ({
        ...t,
        status: 'rejected' as const,
        updated_at: Date.now(),
      })),
    }))
  },

  cancelTransfer: (transferId) => {
    // TODO(backend): wire to `cancel_file_transfer` Tauri command once the
    // Rust side supports it. Today this only drops the row locally — the
    // remote write loop keeps running until the transfer naturally finishes.
    set((s) => ({
      transfers: s.transfers.filter((t) => t.id !== transferId),
    }))
  },
}))

// Selectors
export const selectActiveTransfers = (s: TransfersState) =>
  s.transfers.filter(
    (t) =>
      t.status === 'in_progress' ||
      t.status === 'pending' ||
      t.status === 'pending_response' ||
      t.status === 'accepted',
  )

export const selectCompletedTransfers = (s: TransfersState) =>
  s.transfers.filter(
    (t) => t.status === 'completed' || t.status === 'failed' || t.status === 'rejected',
  )
