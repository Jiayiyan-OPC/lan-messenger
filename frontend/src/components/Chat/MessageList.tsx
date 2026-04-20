import { useEffect, useLayoutEffect, useRef } from 'react'
import { DayDivider } from './DayDivider'
import { TextBubble } from './TextBubble'
import { FileBubble } from './FileBubble'
import { toDisplayMessage } from '../../lib/displayMessage'
import type { Contact, StoredMessage } from '../../types'

interface MessageListProps {
  messages: StoredMessage[]
  deviceId: string | null
  peer: Contact
}

const SCROLL_LOCK_SLOP = 120 // px

export function MessageList({ messages, deviceId, peer }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const prevLenRef = useRef(messages.length)

  // When the user scrolls up ≥ SLOP px from the bottom, pause auto-scrolling.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
      stickRef.current = distFromBottom < SCROLL_LOCK_SLOP
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Autoscroll only when stuck to bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (stickRef.current) {
      el.scrollTop = el.scrollHeight
    }
    prevLenRef.current = messages.length
  }, [messages])

  // When switching conversations, snap to bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = true
    el.scrollTop = el.scrollHeight
  }, [peer.id])

  if (messages.length === 0) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-2 text-[13px] text-[var(--text-hint)]"
        style={{ background: 'var(--surface-window)' }}
      >
        <div>还没有消息，发一句「你好」开始对话吧</div>
        <div className="font-mono text-[11px] opacity-80">拖拽文件即可发送</div>
      </div>
    )
  }

  // Precompute day-change markers and the "showAvatar" rule (last of a run).
  const items: Array<
    | { kind: 'divider'; id: string; ts: number }
    | { kind: 'msg'; id: string; msg: StoredMessage; showAvatar: boolean; fresh: boolean }
  > = []
  let lastDate: string | null = null
  const lastIdx = messages.length - 1
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!
    const dateKey = new Date(m.timestamp).toDateString()
    if (dateKey !== lastDate) {
      items.push({ kind: 'divider', id: `d-${m.id}`, ts: m.timestamp })
      lastDate = dateKey
    }
    const next = messages[i + 1]
    const showAvatar = !next || next.sender_id !== m.sender_id
    // Mark the final message as "fresh" so it gets the pop animation once.
    const fresh = i === lastIdx && prevLenRef.current < messages.length
    items.push({ kind: 'msg', id: m.id, msg: m, showAvatar, fresh })
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-6 py-[18px]"
      style={{ background: 'var(--surface-window)' }}
    >
      <div className="flex flex-col gap-[2px]">
        {items.map((item) => {
          if (item.kind === 'divider') {
            return <DayDivider key={item.id} timestamp={item.ts} />
          }
          const display = toDisplayMessage(item.msg, deviceId)
          const mine = display.from === 'me'
          const Bubble = display.kind === 'file' ? FileBubble : TextBubble
          return (
            <Bubble
              key={item.id}
              msg={display}
              mine={mine}
              showAvatar={item.showAvatar}
              peerName={peer.name}
              fresh={item.fresh}
            />
          )
        })}
      </div>
    </div>
  )
}
