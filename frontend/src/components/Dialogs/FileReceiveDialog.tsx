import * as Dialog from '@radix-ui/react-dialog'
import { Download, X } from 'lucide-react'
import { useTransfersStore } from '../../stores/transfers'
import { formatSize } from '../../lib/format'

export function FileReceiveDialog() {
  const pendingRequests = useTransfersStore((s) => s.pendingRequests)
  const acceptTransfer = useTransfersStore((s) => s.acceptTransfer)
  const rejectTransfer = useTransfersStore((s) => s.rejectTransfer)

  const pending = pendingRequests[0]
  if (!pending) return null

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-[#1a1a2e] p-6 shadow-xl">
          <Dialog.Title className="flex items-center gap-2 text-lg font-semibold text-[#e0e0e0]">
            <Download className="h-5 w-5 text-[#4ecca3]" />
            Incoming File
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm text-[#94a3b8]">
            <strong className="text-[#e0e0e0]">{pending.fromId.slice(0, 8)}</strong> wants to send you a file:
          </Dialog.Description>
          <div className="mt-3 rounded-lg bg-[#16213e] p-3">
            <div className="truncate text-sm font-medium text-[#e0e0e0]">{pending.fileName}</div>
            <div className="mt-0.5 text-xs text-[#666]">{formatSize(pending.fileSize)}</div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => rejectTransfer(pending.transferId)}
              className="rounded-lg border border-[#16213e] px-4 py-2 text-sm text-[#94a3b8] hover:bg-[#16213e]"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => acceptTransfer(pending.transferId)}
              className="rounded-lg bg-[#4ecca3] px-4 py-2 text-sm font-medium text-[#0a0a1a] hover:bg-[#3dbb92]"
            >
              Accept
            </button>
          </div>
          <Dialog.Close asChild>
            <button
              type="button"
              onClick={() => rejectTransfer(pending.transferId)}
              className="absolute right-3 top-3 text-[#666] hover:text-[#e0e0e0]"
            >
              <X className="h-4 w-4" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
