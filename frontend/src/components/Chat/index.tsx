import { useEffect, useCallback } from 'react'
import { MessageSquare } from 'lucide-react'
import { useContactsStore, selectSelectedContact } from '../../stores/contacts'
import { useMessagesStore, selectMessages } from '../../stores/messages'
import { useAppStore } from '../../stores/app'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'

export function ChatView() {
  const selectedContact = useContactsStore(selectSelectedContact)
  const selectedId = useContactsStore((s) => s.selectedId)
  const messages = useMessagesStore(selectMessages(selectedId))
  const loadMessages = useMessagesStore((s) => s.loadMessages)
  const sendMessage = useMessagesStore((s) => s.sendMessage)
  const sending = useMessagesStore((s) => s.sending)
  const init = useMessagesStore((s) => s.init)
  const deviceId = useAppStore((s) => s.deviceId)

  useEffect(() => { init() }, [init])

  useEffect(() => {
    if (selectedId) loadMessages(selectedId)
  }, [selectedId, loadMessages])

  const handleSend = useCallback(
    (content: string) => {
      if (selectedId) sendMessage(selectedId, content)
    },
    [selectedId, sendMessage],
  )

  if (!selectedContact) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-[#666]">
        <MessageSquare className="mb-3 h-12 w-12 opacity-40" />
        <p>Select a contact to start chatting</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#0f3460] bg-[#1a1a2e] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-[#e0e0e0]">{selectedContact.name}</span>
          <span className={selectedContact.online ? 'text-xs text-[#4ecca3]' : 'text-xs text-[#666]'}>
            {selectedContact.online ? 'Online' : 'Offline'}
          </span>
        </div>
        <span className="text-xs text-[#555]">{selectedContact.ip_address}</span>
      </div>

      <MessageList messages={messages} deviceId={deviceId} />
      <MessageInput onSend={handleSend} disabled={sending} />
    </div>
  )
}
