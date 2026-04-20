import { cn } from '../../lib/cn'
import type { DetailTab } from '../../types'

interface DetailTabsProps {
  value: DetailTab
  onChange: (v: DetailTab) => void
  fileCount: number
}

export function DetailTabs({ value, onChange, fileCount }: DetailTabsProps) {
  const items: Array<{ id: DetailTab; label: string; count: number | null }> = [
    { id: 'files', label: '文件', count: fileCount },
    { id: 'info', label: '详情', count: null },
  ]
  return (
    <div
      className="flex gap-4 px-4 pt-[10px]"
      style={{ borderBottom: '1px solid var(--border-soft)' }}
    >
      {items.map((t) => {
        const active = value === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              'inline-flex items-center gap-[6px] px-[2px] pb-[10px] pt-2 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
              active
                ? 'font-bold text-[var(--text-primary)]'
                : 'font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            )}
            style={{
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
            {t.count !== null && (
              <span className="text-[11px] font-semibold text-[var(--text-hint)]">
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
