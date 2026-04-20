import { Check, CheckCheck, CircleAlert } from 'lucide-react'
import type { StoredMessage } from '../../types'

interface StatusIconProps {
  status: StoredMessage['status'] | undefined
  /** Pixel size — used for spinner and check glyphs alike. */
  size?: number
}

/** Lifecycle icon for self messages: sending / sent / delivered / read / failed. */
export function StatusIcon({ status, size = 11 }: StatusIconProps) {
  if (!status) return null
  if (status === 'sending') {
    return (
      <span
        aria-label="发送中"
        className="inline-block animate-spin-slow rounded-full border-[1.5px] border-current border-t-transparent"
        style={{ width: size, height: size }}
      />
    )
  }
  if (status === 'failed') {
    return <CircleAlert size={size + 1} strokeWidth={2} color="var(--warning-red)" aria-label="发送失败" />
  }
  if (status === 'read') {
    return <CheckCheck size={size + 1} strokeWidth={2} color="var(--accent)" aria-label="已读" />
  }
  if (status === 'delivered' || status === 'sent' || status === 'received') {
    return <Check size={size} strokeWidth={2} aria-label="已送达" />
  }
  return null
}
