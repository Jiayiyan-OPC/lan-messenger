import { cn } from '../../lib/cn'

interface ProgressBarProps {
  value: number // 0-1
  className?: string
}

export function ProgressBar({ value, className }: ProgressBarProps) {
  return (
    <div className={cn('h-1 w-full overflow-hidden rounded-full bg-[#0f3460]', className)}>
      <div
        className="h-full rounded-full bg-[#4ecca3] transition-[width] duration-300"
        style={{ width: `${Math.min(100, value * 100)}%` }}
      />
    </div>
  )
}
