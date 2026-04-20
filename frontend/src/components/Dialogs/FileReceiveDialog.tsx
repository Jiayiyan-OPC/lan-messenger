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
        <Dialog.Overlay
          className="fixed inset-0 animate-fade-in"
          style={{ background: 'rgba(30,42,51,0.28)', zIndex: 200 }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 w-[400px] -translate-x-1/2 -translate-y-1/2 p-6"
          style={{
            background: 'var(--surface-window)',
            borderRadius: 22,
            boxShadow: '0 20px 50px rgba(20,40,60,0.28)',
            zIndex: 201,
          }}
        >
          <Dialog.Title className="flex items-center gap-2 text-[16px] font-bold text-[var(--text-primary)]">
            <Download className="h-5 w-5 text-[var(--accent)]" strokeWidth={1.8} />
            收到文件
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-[13px] text-[var(--text-muted)]">
            <strong className="text-[var(--text-primary)]">{pending.fromId.slice(0, 8)}</strong> 想发送文件给你：
          </Dialog.Description>
          <div
            className="mt-3 rounded-[12px] p-3"
            style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-soft)' }}
          >
            <div className="truncate text-[13.5px] font-semibold text-[var(--text-primary)]">
              {pending.fileName}
            </div>
            <div className="mt-[1px] font-mono text-[11.5px] text-[var(--text-muted)]">
              {formatSize(pending.fileSize)}
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => rejectTransfer(pending.transferId)}
              className="rounded-[10px] border border-[var(--border-med)] bg-transparent px-4 py-2 text-[13px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              拒绝
            </button>
            <button
              type="button"
              onClick={() => acceptTransfer(pending.transferId)}
              className="rounded-[10px] px-4 py-2 text-[13px] font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              style={{
                background: 'linear-gradient(135deg, var(--accent-light), var(--accent))',
                boxShadow: '0 2px 6px rgba(58,125,153,0.3)',
              }}
            >
              接收
            </button>
          </div>
          <Dialog.Close asChild>
            <button
              type="button"
              onClick={() => rejectTransfer(pending.transferId)}
              className="absolute right-3 top-3 rounded text-[var(--text-hint)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
