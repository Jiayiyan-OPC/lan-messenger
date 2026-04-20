import { Info, Phone, Search } from 'lucide-react'
import { Avatar } from '../primitives/Avatar'
import { PresenceDot } from '../primitives/PresenceDot'
import { useUiStore } from '../../stores/ui'
import { cn } from '../../lib/cn'
import { hostnameFor } from '../../lib/peer'
import type { Contact } from '../../types'

interface ChatHeaderProps {
  contact: Contact
}

export function ChatHeader({ contact }: ChatHeaderProps) {
  const detailOpen = useUiStore((s) => s.detailOpen)
  const toggleDetail = useUiStore((s) => s.toggleDetail)
  const pushToast = useUiStore((s) => s.pushToast)

  return (
    <div
      className="flex items-center gap-[14px] px-5"
      style={{
        height: 62,
        flexShrink: 0,
        background: 'var(--surface-window)',
        borderBottom: '1px solid var(--border-soft)',
      }}
    >
      <Avatar id={contact.id} name={contact.name} size={40} online={contact.online} ringColor="var(--surface-window)" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div
            className="truncate text-[15.5px] font-bold text-[var(--text-primary)]"
            style={{ letterSpacing: '-0.2px' }}
          >
            {contact.name}
          </div>
          {contact.online && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-[7px] py-[2px] text-[10.5px] font-semibold"
              style={{ background: 'var(--online-tint)', color: '#3F8A73' }}
            >
              <PresenceDot size={6} online />
              在线
            </span>
          )}
        </div>
        <div className="mt-[1px] truncate font-mono text-[11.5px] text-[var(--text-muted)]">
          {hostnameFor(contact)} · {contact.ip_address}
        </div>
      </div>
      <HeaderButton
        title="语音通话（敬请期待）"
        onClick={() => pushToast({ kind: 'info', title: '语音通话即将上线' })}
      >
        <Phone size={17} strokeWidth={1.8} />
      </HeaderButton>
      <HeaderButton
        title="搜索本对话（敬请期待）"
        onClick={() => pushToast({ kind: 'info', title: '搜索即将上线' })}
      >
        <Search size={17} strokeWidth={1.8} />
      </HeaderButton>
      <HeaderButton
        title={detailOpen ? '隐藏详情' : '显示详情'}
        onClick={toggleDetail}
        active={detailOpen}
      >
        <Info size={17} strokeWidth={1.8} />
      </HeaderButton>
    </div>
  )
}

function HeaderButton({
  children,
  title,
  onClick,
  active,
}: {
  children: React.ReactNode
  title: string
  onClick?: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-[34px] w-[34px] items-center justify-center rounded-[10px] transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
        active
          ? 'text-[var(--accent-dark)]'
          : 'text-[var(--text-secondary)] hover:bg-[rgba(30,42,51,0.05)]',
      )}
      style={active ? { background: 'rgba(78,154,184,0.15)' } : undefined}
    >
      {children}
    </button>
  )
}
