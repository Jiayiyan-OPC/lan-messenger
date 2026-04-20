import { Download } from 'lucide-react'
import { useTransfersStore } from '../../stores/transfers'
import { formatClock, formatSize } from '../../lib/format'
import { extLabel, fileTintForMime, mimeFromFileName } from '../../lib/fileTint'
import type { FileTransfer } from '../../types'

interface FileListProps {
  peerId: string
}

/** Which transfers "belong to" this peer. We match either the backend-tracked
 *  peer_id when present, or fall back to any transfer whose message_id links
 *  to this peer (not available in the current Rust schema — falls through).
 */
function belongsToPeer(t: FileTransfer, peerId: string): boolean {
  if (t.peer_id === peerId) return true
  // Fallback: currently the backend doesn't populate peer_id, so show all.
  // Detail panel is scoped to the active peer anyway, so this is sane.
  return !t.peer_id
}

export function FileList({ peerId }: FileListProps) {
  const transfers = useTransfersStore((s) => s.transfers.filter((t) => belongsToPeer(t, peerId)))

  if (transfers.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-[13px] text-[var(--text-hint)]">
        暂无文件记录
        <br />
        <span className="text-[11.5px]">拖拽到聊天即可发送</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {transfers.map((t) => {
        const mime = mimeFromFileName(t.file_name)
        const tint = fileTintForMime(mime)
        const ext = extLabel(t.file_name, tint.label)
        const when = formatClock(t.updated_at || t.created_at)
        const isOut = t.direction === 'out'
        return (
          <div
            key={t.id}
            className="flex cursor-pointer items-center gap-[10px] rounded-[12px] p-2 transition-colors hover:bg-[rgba(30,42,51,0.04)]"
          >
            <div
              className="flex h-[44px] w-[38px] shrink-0 items-center justify-center text-[9px] font-extrabold"
              style={{ background: tint.bg, color: tint.fg, borderRadius: 7 }}
            >
              {ext}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold text-[var(--text-primary)]">
                {t.file_name}
              </div>
              <div
                className="mt-[1px] text-[11px] text-[var(--text-muted)]"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {isOut ? '↑' : '↓'} {formatSize(t.file_size)} · {when}
              </div>
            </div>
            <button
              type="button"
              title="下载"
              className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[var(--text-muted)] hover:bg-[rgba(30,42,51,0.06)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              <Download size={14} strokeWidth={1.8} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
