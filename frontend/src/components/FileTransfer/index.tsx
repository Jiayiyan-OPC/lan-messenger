import { useEffect, useRef, useCallback } from 'react'
import { useTransfersStore, selectActiveTransfers, selectCompletedTransfers } from '../../stores/transfers'
import { useContactsStore } from '../../stores/contacts'
import { TransferToolbar } from './TransferToolbar'
import { TransferItem } from './TransferItem'

export function FileTransferView() {
  const init = useTransfersStore((s) => s.init)
  const sendFile = useTransfersStore((s) => s.sendFile)
  const rejectTransfer = useTransfersStore((s) => s.rejectTransfer)
  const activeTransfers = useTransfersStore(selectActiveTransfers)
  const completedTransfers = useTransfersStore(selectCompletedTransfers)
  const selectedId = useContactsStore((s) => s.selectedId)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { init() }, [init])

  const handleSendFile = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !selectedId) return
      // Tauri provides the real path via webkitRelativePath or name
      await sendFile(selectedId, (file as any).path ?? file.name)
      e.target.value = ''
    },
    [selectedId, sendFile],
  )

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4">
      <TransferToolbar onSendFile={handleSendFile} disabled={!selectedId} />
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

      {activeTransfers.length > 0 && (
        <section className="mt-5">
          <h4 className="mb-2 text-xs uppercase tracking-wider text-[#888]">Active</h4>
          <div className="flex flex-col gap-1.5">
            {activeTransfers.map((t) => (
              <TransferItem
                key={t.id}
                transfer={t}
                onCancel={() => rejectTransfer(t.id)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-5">
        <h4 className="mb-2 text-xs uppercase tracking-wider text-[#888]">History</h4>
        {completedTransfers.length === 0 ? (
          <p className="py-4 text-center text-sm text-[#555]">No transfer history</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {completedTransfers.map((t) => (
              <TransferItem key={t.id} transfer={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
