import { invoke } from '@tauri-apps/api/core'

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

  /** Accept an incoming transfer with the user-chosen save location. */
  accept: (transferId: string, savePath: string) =>
    invoke<void>('accept_file_transfer', { transferId, savePath }),

  reject: (transferId: string) =>
    invoke<void>('reject_file_transfer', { transferId }),

  /** Cancel an outbound transfer. Returns true if a live transfer was hit. */
  cancel: (transferId: string) =>
    invoke<boolean>('cancel_file_transfer', { transferId }),
}
