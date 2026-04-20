import { cn } from '../../lib/cn'
import { Check, CheckCheck } from 'lucide-react'
import type { StoredMessage } from '../../types'

interface MessageBubbleProps {
  message: StoredMessage
  isSelf: boolean
}

function formatMsgTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function MessageBubble({ message, isSelf }: MessageBubbleProps) {
  return (
    <div className={cn('flex', isSelf ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[70%] rounded-xl px-3 py-2',
          isSelf
            ? 'rounded-br-sm bg-[#533483] text-[#e0e0e0]'
            : 'rounded-bl-sm bg-[#0f3460] text-[#e0e0e0]',
        )}
      >
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-white/50">
          <span>{formatMsgTime(message.timestamp)}</span>
          {isSelf && (
            message.status === 'delivered' || message.status === 'read'
              ? <CheckCheck className="h-3 w-3" />
              : message.status === 'sent'
                ? <Check className="h-3 w-3" />
                : null
          )}
        </div>
      </div>
    </div>
  )
}
