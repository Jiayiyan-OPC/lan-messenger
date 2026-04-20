import { invoke } from '@tauri-apps/api/core'

export const fileTransfer = {
  initiate: (recipientId: string, filePath: string) =>
    invoke<string>('initiate_file_transfer', {
      request: { recipient_id: recipientId, file_path: filePath },
    }),

  accept: (transferId: string) =>
    invoke<void>('accept_file_transfer', { transferId }),

  reject: (transferId: string) =>
    invoke<void>('reject_file_transfer', { transferId }),
}
