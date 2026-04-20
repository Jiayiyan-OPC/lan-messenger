import { Search, X } from 'lucide-react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="px-[14px] pt-[6px] pb-2">
      <div
        className="flex items-center gap-2 rounded-[12px] px-3 py-2 text-[var(--text-muted)]"
        style={{
          background: 'var(--surface-raised)',
          border: '1px solid var(--border-soft)',
        }}
      >
        <Search size={15} strokeWidth={1.8} className="shrink-0" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="搜索联系人、设备、消息…"
          className="flex-1 border-none bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus-visible:outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            title="清除"
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        )}
      </div>
    </div>
  )
}
