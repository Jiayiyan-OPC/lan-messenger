import { cn } from '../../lib/cn'
import type { SidebarTab } from '../../types'

interface TabsProps {
  value: SidebarTab
  onChange: (v: SidebarTab) => void
  chatBadge: number
  deviceBadge: number
}

export function Tabs({ value, onChange, chatBadge, deviceBadge }: TabsProps) {
  const items: Array<{ id: SidebarTab; label: string; count: number }> = [
    { id: 'chats', label: '会话', count: chatBadge },
    { id: 'devices', label: '设备', count: deviceBadge },
  ]
  return (
    <div className="flex gap-1 px-[14px] pb-2">
      {items.map((t) => {
        const active = value === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-[6px] rounded-[10px] py-[7px] text-[12.5px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
              active
                ? 'bg-[var(--surface-raised)] font-bold text-[var(--text-primary)]'
                : 'font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            )}
            style={
              active
                ? {
                    boxShadow:
                      '0 1px 3px rgba(30,50,70,0.06), 0 0 0 1px rgba(30,42,51,0.05)',
                  }
                : undefined
            }
          >
            {t.label}
            {t.count > 0 && (
              <span
                className="inline-flex h-4 min-w-[17px] items-center justify-center rounded-full px-[5px] text-[10px] font-bold"
                style={
                  active
                    ? { background: 'var(--accent)', color: '#fff' }
                    : { background: 'rgba(30,42,51,0.08)', color: 'var(--text-muted)' }
                }
              >
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
