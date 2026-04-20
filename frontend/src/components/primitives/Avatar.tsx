import { avatarColorForId, initialsFor, shadeHex } from '../../lib/peer'
import { cn } from '../../lib/cn'

interface AvatarProps {
  /** Peer/contact id — drives the deterministic color. */
  id: string
  /** Display name — drives the initial letter. */
  name: string
  /** Pixel size. Default matches sidebar ConvoRow at 42. */
  size?: number
  /** Optional online dot (tri-state). Omitted = no dot. */
  online?: boolean
  /** 'circle' (default) or 'squircle' (for groups — size * 0.32). */
  shape?: 'circle' | 'squircle'
  /** Override the ring color of the presence dot (matches parent bg). */
  ringColor?: string
  className?: string
}

export function Avatar({
  id,
  name,
  size = 42,
  online,
  shape = 'circle',
  ringColor = 'var(--surface-sidebar)',
  className,
}: AvatarProps) {
  const bg = avatarColorForId(id)
  const initial = initialsFor(name)
  const radius = shape === 'squircle' ? Math.round(size * 0.32) : Math.round(size * 0.5)
  const dotSize = Math.max(8, Math.round(size * 0.24))

  return (
    <div
      className={cn('relative inline-flex shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <div
        className="flex h-full w-full items-center justify-center text-white select-none"
        style={{
          borderRadius: radius,
          background: `linear-gradient(135deg, ${bg} 0%, ${shadeHex(bg, -18)} 100%)`,
          fontSize: Math.round(size * 0.38),
          fontWeight: 700,
          letterSpacing: '-0.3px',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.22), 0 1px 2px rgba(30,50,70,0.1)',
        }}
      >
        {initial}
      </div>
      {online !== undefined && (
        <span
          aria-hidden
          className="absolute -bottom-[1px] -right-[1px] rounded-full"
          style={{
            width: dotSize,
            height: dotSize,
            background: online ? 'var(--online)' : 'var(--text-hint)',
            boxShadow: `0 0 0 2px ${ringColor}`,
          }}
        />
      )}
    </div>
  )
}
