import { invoke } from '@tauri-apps/api/core'
import type { FileTransfer } from '../types'

export interface InitiateFileTransferResponse {
  transfer_id: string
  file_name: string
  file_size: number
}

export const fileTransfer = {
  initiate: (recipientId: string, filePath: string) =>
    invoke<InitiateFileTransferResponse>('initiate_file_transfer', {
      request: { recipient_id: recipientId, file_path: filePath },
    }),

  /** Bulk fetch persisted file_transfer rows — used to rehydrate the
   *  in-memory transfers store after app restart. */
  getByIds: (ids: string[]) =>
    invoke<FileTransfer[]>('get_file_transfers_by_ids', { ids }),

  /** Stat a path. Returns true iff a regular file exists there. Used by
   *  FileBubble to gate "reveal in Finder" and give a clean toast when the
   *  file has been moved or deleted since it was transferred. */
  exists: (path: string) => invoke<boolean>('file_exists', { path }),

  /** Accept an incoming transfer with the user-chosen save location. */
  accept: (transferId: string, savePath: string) =>
    invoke<void>('accept_file_transfer', { transferId, savePath }),

  reject: (transferId: string) =>
    invoke<void>('reject_file_transfer', { transferId }),

  /** Cancel an outbound transfer. Returns true if a live transfer was hit. */
  cancel: (transferId: string) =>
    invoke<boolean>('cancel_file_transfer', { transferId }),
}
