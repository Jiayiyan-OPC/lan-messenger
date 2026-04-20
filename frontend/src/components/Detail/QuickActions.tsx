import { Folder, Phone, Pin } from 'lucide-react'
import { useUiStore } from '../../stores/ui'
import { cn } from '../../lib/cn'
import type { DetailTab } from '../../types'

interface QuickActionsProps {
  peerId: string
  onSelectTab: (tab: DetailTab) => void
}

export function QuickActions({ peerId, onSelectTab }: QuickActionsProps) {
  const pushToast = useUiStore((s) => s.pushToast)
  const pinned = useUiStore((s) => s.isPinned(peerId))
  const togglePinned = useUiStore((s) => s.togglePinned)

  const tiles = [
    {
      key: 'phone' as const,
      icon: <Phone size={16} strokeWidth={1.8} />,
      label: '通话',
      onClick: () => pushToast({ kind: 'info', title: '语音通话即将上线' }),
    },
    {
      key: 'files' as const,
      icon: <Folder size={16} strokeWidth={1.8} />,
      label: '文件',
      onClick: () => onSelectTab('files'),
    },
    {
      key: 'pin' as const,
      icon: <Pin size={14} strokeWidth={1.8} />,
      label: pinned ? '取消置顶' : '置顶',
      onClick: () => togglePinned(peerId),
    },
  ]

  return (
    <div className="flex justify-center gap-[10px] pb-4 pt-1">
      {tiles.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={t.onClick}
          className={cn(
            'flex w-16 flex-col items-center gap-1 rounded-[12px] py-[10px] text-[10.5px] font-semibold',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
            t.key === 'pin' && pinned
              ? 'text-[var(--accent-dark)]'
              : 'text-[var(--text-secondary)]',
          )}
          style={{
            background: t.key === 'pin' && pinned ? 'rgba(78,154,184,0.15)' : 'var(--surface-raised)',
            border: '1px solid var(--border-soft)',
          }}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  )
}
