import { invoke } from '@tauri-apps/api/core'

export const fileTransfer = {
  initiate: (recipientId: string, filePath: string) =>
    invoke<string>('initiate_file_transfer', {
      request: { recipient_id: recipientId, file_path: filePath },
    }),

  /** Accept an incoming transfer with the user-chosen save location. */
  accept: (transferId: string, savePath: string) =>
    invoke<void>('accept_file_transfer', { transferId, savePath }),

  reject: (transferId: string) =>
    invoke<void>('reject_file_transfer', { transferId }),
}
