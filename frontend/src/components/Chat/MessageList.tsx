import { useEffect, useRef } from 'react'
import { MessageBubble } from './MessageBubble'
import { DateSeparator } from './DateSeparator'
import type { StoredMessage } from '../../types'

interface MessageListProps {
  messages: StoredMessage[]
  deviceId: string | null
}

function shouldShowDate(messages: StoredMessage[], index: number): boolean {
  if (index === 0) return true
  const prev = new Date(messages[index - 1]!.timestamp).toDateString()
  const curr = new Date(messages[index]!.timestamp).toDateString()
  return prev !== curr
}

export function MessageList({ messages, deviceId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[#555]">
        No messages yet. Say hello! 👋
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-3">
      {messages.map((msg, i) => (
        <div key={msg.id}>
          {shouldShowDate(messages, i) && <DateSeparator timestamp={msg.timestamp} />}
          <MessageBubble message={msg} isSelf={msg.sender_id === deviceId} />
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
