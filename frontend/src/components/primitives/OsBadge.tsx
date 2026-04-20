import { osBucket } from '../../lib/peer'

interface OsBadgeProps {
  os: string | null | undefined
}

/**
 * Small pill label for the operating system. Renders "设备" when the OS is
 * unknown so the row doesn't look broken.
 */
export function OsBadge({ os }: OsBadgeProps) {
  const bucket = osBucket(os)

  const palette = bucket === 'mac'
    ? { label: 'macOS', bg: '#DEE6ED', fg: '#55656F' }
    : bucket === 'win'
      ? { label: 'Win', bg: '#D9E4EA', fg: '#4F6670' }
      : bucket === 'linux'
        ? { label: 'Linux', bg: '#E0E6EC', fg: '#4A5C52' }
        : { label: '设备', bg: '#E6EBF0', fg: '#6B7784' }

  return (
    <span
      className="inline-flex items-center rounded-full px-[6px] py-[1px] text-[10px] font-semibold"
      style={{ background: palette.bg, color: palette.fg, letterSpacing: '0.1px' }}
    >
      {palette.label}
    </span>
  )
}
