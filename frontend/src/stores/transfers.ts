import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fileTransfer as ftApi, events } from '../ipc'

export interface Transfer {
  id: string
  fileName: string
  fileSize: number
  bytesTransferred: number
  progress: number
  status: 'pending' | 'transferring' | 'completed' | 'failed' | 'rejected' | 'cancelled'
  direction: 'send' | 'receive'
  peerId: string
}

export const useTransfersStore = defineStore('transfers', () => {
  const transfers = ref<Transfer[]>([])

  const activeTransfers = computed(() =>
    transfers.value.filter((t) => t.status === 'pending' || t.status === 'transferring'),
  )

  async function sendFile(recipientId: string, filePath: string, fileName: string, fileSize: number) {
    const transferId = await ftApi.initiate(recipientId, filePath)
    transfers.value.push({
      id: transferId,
      fileName,
      fileSize,
      bytesTransferred: 0,
      progress: 0,
      status: 'pending',
      direction: 'send',
      peerId: recipientId,
    })
    return transferId
  }

  async function acceptTransfer(transferId: string) {
    await ftApi.accept(transferId)
    const t = transfers.value.find((t) => t.id === transferId)
    if (t) t.status = 'transferring'
  }

  async function rejectTransfer(transferId: string) {
    await ftApi.reject(transferId)
    const t = transfers.value.find((t) => t.id === transferId)
    if (t) t.status = 'rejected'
  }

  function setupListeners() {
    events.onFileTransferProgress((p) => {
      const t = transfers.value.find((t) => t.id === p.transfer_id)
      if (t) {
        t.bytesTransferred = p.bytes_transferred
        t.progress = t.fileSize > 0 ? p.bytes_transferred / t.fileSize : 0
        t.status = 'transferring'
      }
    })

    events.onFileTransferComplete((transferId) => {
      const t = transfers.value.find((t) => t.id === transferId)
      if (t) {
        t.status = 'completed'
        t.progress = 1
        t.bytesTransferred = t.fileSize
      }
    })
  }

  return {
    transfers,
    activeTransfers,
    sendFile,
    acceptTransfer,
    rejectTransfer,
    setupListeners,
  }
})
