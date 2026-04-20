import { cn } from '../../lib/cn'

interface AvatarProps {
  name: string
  online?: boolean
  className?: string
}

export function Avatar({ name, online, className }: AvatarProps) {
  const initial = name.charAt(0).toUpperCase()
  return (
    <div className={cn('relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#533483]', className)}>
      <span className="text-white text-sm font-semibold">{initial}</span>
      {online !== undefined && (
        <span
          className={cn(
            'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#1a1a2e]',
            online ? 'bg-[#4ecca3]' : 'bg-[#666]',
          )}
        />
      )}
    </div>
  )
}
