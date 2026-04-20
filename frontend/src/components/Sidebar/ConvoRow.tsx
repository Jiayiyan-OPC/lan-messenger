import { Pin } from 'lucide-react'
import { Avatar } from '../primitives/Avatar'
import { cn } from '../../lib/cn'
import { formatListTime } from '../../lib/format'
import type { Contact, StoredMessage } from '../../types'

interface ConvoRowProps {
  contact: Contact
  active: boolean
  pinned: boolean
  lastMsg: StoredMessage | undefined
  unread: number
  onClick: () => void
}

function previewText(m: StoredMessage | undefined): string {
  if (!m) return '等待消息…'
  if (m.file_transfer_id) return '📎 文件'
  return m.content
}

export function ConvoRow({ contact, active, pinned, lastMsg, unread, onClick }: ConvoRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-[14px] px-3 py-[10px] text-left transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
        active ? 'bg-[rgba(78,154,184,0.14)]' : 'hover:bg-[rgba(30,42,51,0.04)]',
      )}
    >
      <Avatar id={contact.id} name={contact.name} size={42} online={contact.online} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-[6px]">
          <div className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-[var(--text-primary)]">
            {contact.name}
          </div>
          {pinned && <Pin size={11} strokeWidth={1.8} className="shrink-0 text-[var(--text-hint)]" />}
          <div
            className="shrink-0 text-[11.5px] text-[var(--text-muted)]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {lastMsg ? formatListTime(lastMsg.timestamp) : ''}
          </div>
        </div>
        <div className="mt-[2px] flex items-center gap-[6px]">
          <div className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text-muted)]">
            {previewText(lastMsg)}
          </div>
          {unread > 0 && (
            <span
              className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[6px] text-[11px] font-bold text-white"
              style={{ background: 'var(--accent)' }}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
