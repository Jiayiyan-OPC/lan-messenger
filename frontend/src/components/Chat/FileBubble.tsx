import { Check, Download, FolderOpen, X } from 'lucide-react'
import { save } from '@tauri-apps/plugin-dialog'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { useTransfersStore } from '../../stores/transfers'
import { useUiStore } from '../../stores/ui'
import { cn } from '../../lib/cn'
import { formatSize } from '../../lib/format'
import { extLabel, fileTintForMime, mimeFromFileName } from '../../lib/fileTint'
import { Avatar } from '../primitives/Avatar'
import type { DisplayMessage } from '../../lib/displayMessage'
import type { FileTransfer } from '../../types'

interface FileBubbleProps {
  msg: DisplayMessage
  mine: boolean
  showAvatar: boolean
  peerName?: string
  fresh?: boolean
}

/** Derive transfer-centric display state from the store, falling back to text. */
function useTransferForMessage(fileTransferId: string | undefined): FileTransfer | null {
  const transfers = useTransfersStore((s) => s.transfers)
  if (!fileTransferId) return null
  return transfers.find((t) => t.id === fileTransferId) ?? null
}

export function FileBubble({ msg, mine, showAvatar, peerName, fresh }: FileBubbleProps) {
  const transfer = useTransferForMessage(msg.fileTransferId)
  const cancelTransfer = useTransfersStore((s) => s.cancelTransfer)
  const acceptIncoming = useTransfersStore((s) => s.acceptIncoming)
  const rejectIncoming = useTransfersStore((s) => s.rejectIncoming)
  const pushToast = useUiStore((s) => s.pushToast)

  const fileName = transfer?.file_name || msg.text || 'file'
  const fileSize = transfer?.file_size ?? 0
  const mime = mimeFromFileName(fileName)
  const tint = fileTintForMime(mime)
  const ext = extLabel(fileName, tint.label)

  const bytesTransferred = transfer?.bytes_transferred ?? 0
  const pct =
    transfer && transfer.file_size > 0
      ? Math.min(100, Math.round((bytesTransferred / transfer.file_size) * 100))
      : 0
  const status = transfer?.status ?? 'pending'
  const awaitingDecision = status === 'pending_response'
  const failed = status === 'failed' || status === 'rejected'
  const done = status === 'completed'
  const transferring = !awaitingDecision && !done && !failed

  const handleAccept = async () => {
    if (!transfer) return
    try {
      const picked = await save({
        defaultPath: transfer.file_name,
        title: `保存 ${transfer.file_name}`,
      })
      if (!picked) return
      await acceptIncoming(transfer.id, picked)
    } catch (err) {
      pushToast({
        kind: 'info',
        title: '接收失败',
        body: String(err),
      })
    }
  }

  const handleReject = () => {
    if (!transfer) return
    rejectIncoming(transfer.id).catch((err) =>
      pushToast({ kind: 'info', title: '拒绝失败', body: String(err) }),
    )
  }

  const handleReveal = async () => {
    if (!transfer?.local_path) {
      pushToast({ kind: 'info', title: '文件位置未知', body: '后端未回传保存路径' })
      return
    }
    try {
      await revealItemInDir(transfer.local_path)
    } catch (err) {
      pushToast({
        kind: 'info',
        title: '打开文件夹失败',
        body: String(err),
      })
    }
  }

  return (
    <div
      className={cn(
        'flex gap-[10px] py-[2px]',
        mine ? 'flex-row-reverse' : 'flex-row',
        fresh ? 'animate-msg-pop' : '',
      )}
    >
      <div className="w-8 shrink-0 self-end">
        {!mine && showAvatar && (
          <Avatar
            id={String(msg.from)}
            name={peerName ?? String(msg.from)}
            size={32}
            ringColor="var(--surface-window)"
          />
        )}
      </div>
      <div
        className={cn(
          'flex min-w-0 max-w-[68%] flex-col',
          mine ? 'items-end' : 'items-start',
        )}
      >
        <div
          className="flex w-[320px] max-w-full flex-col gap-[10px] rounded-[16px] p-3"
          style={{
            background: mine ? '#E6F0F6' : 'var(--surface-raised)',
            border: '1px solid rgba(30,42,51,0.05)',
            boxShadow: '0 1px 2px rgba(30,50,70,0.05)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="relative flex h-[52px] w-[44px] shrink-0 items-center justify-center"
              style={{
                background: failed ? 'rgba(255,106,90,0.18)' : tint.bg,
                color: failed ? 'var(--warning-red)' : tint.fg,
                borderRadius: 8,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.5px',
              }}
            >
              <span
                aria-hidden
                className="absolute right-0 top-0 h-[10px] w-[10px]"
                style={{
                  background: mine ? '#E6F0F6' : 'var(--surface-raised)',
                  clipPath: 'polygon(0 0, 100% 100%, 100% 0)',
                }}
              />
              {ext}
            </div>
            <div className="min-w-0 flex-1">
              <div
                data-selectable
                className="truncate text-[13.5px] font-semibold text-[var(--text-primary)]"
              >
                {fileName}
              </div>
              <div
                className="mt-[2px] text-[11.5px] text-[var(--text-muted)]"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {failed
                  ? status === 'rejected'
                    ? '已拒绝'
                    : '传输失败'
                  : awaitingDecision
                    ? `${formatSize(fileSize || 0)} · 等待你决定`
                    : transferring
                      ? `${formatSize(bytesTransferred)} / ${formatSize(fileSize || 0)} · ${pct}%`
                      : `${formatSize(fileSize || 0)} · ${mine ? '已发送' : '已接收'}`}
              </div>
            </div>
            {done && (
              <button
                type="button"
                title="在访达中显示"
                onClick={handleReveal}
                className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[var(--text-secondary)] hover:bg-[rgba(30,42,51,0.07)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                style={{ background: 'rgba(30,42,51,0.04)' }}
              >
                <FolderOpen size={16} strokeWidth={1.8} />
              </button>
            )}
          </div>

          {awaitingDecision && (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleReject}
                className="rounded-[10px] border border-[var(--border-med)] px-3 py-[6px] text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[rgba(30,42,51,0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                <X size={13} strokeWidth={2} className="inline align-[-2px]" />
                <span className="ml-[4px]">拒绝</span>
              </button>
              <button
                type="button"
                onClick={handleAccept}
                className="rounded-[10px] px-3 py-[6px] text-[12px] font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-light), var(--accent))',
                  boxShadow: '0 2px 6px rgba(58,125,153,0.3)',
                }}
              >
                <Download size={13} strokeWidth={2} className="inline align-[-2px]" />
                <span className="ml-[4px]">下载…</span>
              </button>
            </div>
          )}

          {transferring && !awaitingDecision && (
            <div
              className="relative h-[6px] overflow-hidden rounded-full"
              style={{ background: 'rgba(30,42,51,0.06)' }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ease-out"
                style={{
                  width: `${pct}%`,
                  background: 'linear-gradient(90deg, var(--accent-light), var(--accent))',
                }}
              />
              <div aria-hidden className="absolute inset-0 animate-shimmer opacity-60" />
            </div>
          )}

          {transferring && !awaitingDecision && (
            <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span className="font-mono">
                {mine ? '↑ 上传中' : '↓ 接收中'} · LAN 直连
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!transfer) return
                  cancelTransfer(transfer.id).catch((err) =>
                    pushToast({ kind: 'info', title: '取消失败', body: String(err) }),
                  )
                }}
                className="rounded px-1 text-[var(--accent-dark)] font-semibold hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                取消
              </button>
            </div>
          )}

          {done && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
              <Check size={12} strokeWidth={2} className="text-[var(--online)]" />
              <span>已完成 · 点击右上角图标在访达中显示</span>
            </div>
          )}

          {failed && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--warning-red)]">
              <X size={12} strokeWidth={2} />
              <span>{status === 'rejected' ? '已拒绝此次传输' : '传输失败'}</span>
            </div>
          )}
        </div>
        <div className="px-2 pt-[3px] text-[10.5px] text-[var(--text-hint)]">
          {msg.t}
        </div>
      </div>
    </div>
  )
}
