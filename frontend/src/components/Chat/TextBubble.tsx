import { cn } from '../../lib/cn'
import { StatusIcon } from '../primitives/StatusIcon'
import { Avatar } from '../primitives/Avatar'
import type { DisplayMessage } from '../../lib/displayMessage'

interface TextBubbleProps {
  msg: DisplayMessage
  /** True when this is the current user's message. */
  mine: boolean
  /** When true, show the peer avatar on the left (run tail). */
  showAvatar: boolean
  /** Optional name for avatar hashing when msg.from is a peer id. */
  peerName?: string
  /** Animate on mount — set true for the last message, false for history. */
  fresh?: boolean
}

export function TextBubble({ msg, mine, showAvatar, peerName, fresh }: TextBubbleProps) {
  return (
    <div
      className={cn(
        'flex gap-[10px] py-[2px]',
        mine ? 'flex-row-reverse' : 'flex-row',
        fresh ? 'animate-msg-pop' : '',
      )}
    >
      <div className="w-8 shrink-0 self-end">
        {!mine && showAvatar && (
          <Avatar
            id={String(msg.from)}
            name={peerName ?? String(msg.from)}
            size={32}
            ringColor="var(--surface-window)"
          />
        )}
      </div>
      <div
        className={cn(
          'flex min-w-0 max-w-[64%] flex-col',
          mine ? 'items-end' : 'items-start',
        )}
      >
        <div
          data-selectable
          className={cn(
            'whitespace-pre-wrap break-words px-[14px] py-[10px] text-[14px] leading-[1.5]',
            mine ? 'text-white' : 'text-[var(--text-primary)]',
          )}
          style={{
            borderRadius: mine ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
            background: mine
              ? 'linear-gradient(135deg, var(--accent-light), var(--accent))'
              : 'var(--surface-raised)',
            boxShadow: mine
              ? '0 2px 6px rgba(58,125,153,0.25)'
              : '0 1px 2px rgba(30,50,70,0.06), 0 0 0 1px rgba(30,42,51,0.04)',
          }}
        >
          {msg.text}
        </div>
        <div className="flex items-center gap-1 px-2 pt-[3px] text-[10.5px] text-[var(--text-hint)]">
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{msg.t}</span>
          {mine && msg.status && <StatusIcon status={msg.status} />}
        </div>
      </div>
    </div>
  )
}
