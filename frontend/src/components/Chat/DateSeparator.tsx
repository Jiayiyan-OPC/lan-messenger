import { formatDate } from '../../lib/format'

interface DateSeparatorProps {
  timestamp: number
}

export function DateSeparator({ timestamp }: DateSeparatorProps) {
  return (
    <div className="flex items-center justify-center py-2">
      <span className="rounded-full bg-[#1a1a2e] px-3 py-0.5 text-xs text-[#555]">
        {formatDate(timestamp)}
      </span>
    </div>
  )
}
