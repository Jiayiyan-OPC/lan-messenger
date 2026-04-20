import { formatDayDivider } from '../../lib/format'

interface DayDividerProps {
  timestamp: number
}

export function DayDivider({ timestamp }: DayDividerProps) {
  return (
    <div className="flex items-center gap-3 py-[6px] pt-[14px]">
      <div className="h-px flex-1" style={{ background: 'var(--border-soft)' }} />
      <div
        className="text-[11px] font-semibold text-[var(--text-hint)]"
        style={{ letterSpacing: '0.3px' }}
      >
        {formatDayDivider(timestamp)}
      </div>
      <div className="h-px flex-1" style={{ background: 'var(--border-soft)' }} />
    </div>
  )
}
