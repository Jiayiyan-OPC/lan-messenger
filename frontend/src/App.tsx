import { useEffect, useRef, useState } from 'react'
import { Send, Search } from 'lucide-react'
import {
  useContactsStore,
  selectFilteredContacts,
  selectSelectedContact,
} from './stores/contacts'
import { useMessagesStore, selectMessages } from './stores/messages'
import { cn } from './lib/cn'
import { formatTime } from './lib/format'
import type { Contact, StoredMessage } from './types'

export function App() {
  const initContacts = useContactsStore((s) => s.init)
  const initMessages = useMessagesStore((s) => s.init)
  const selectedId = useContactsStore((s) => s.selectedId)
  const selectContact = useContactsStore((s) => s.select)
  const searchQuery = useContactsStore((s) => s.searchQuery)
  const setSearch = useContactsStore((s) => s.setSearch)
  const contacts = useContactsStore(selectFilteredContacts)
  const selected = useContactsStore(selectSelectedContact)
  const loadMessages = useMessagesStore((s) => s.loadMessages)

  useEffect(() => {
    initContacts()
    initMessages()
  }, [initContacts, initMessages])

  useEffect(() => {
    if (selectedId) loadMessages(selectedId)
  }, [selectedId, loadMessages])

  return (
    <div className="flex h-screen bg-[#0a0a1a] text-[#e2e8f0]">
      <aside className="w-[280px] border-r border-[#16213e] bg-[#1a1a2e] flex flex-col">
        <div className="p-4 text-lg font-semibold border-b border-[#16213e]">
          LAN Messenger
        </div>
        <div className="p-3 border-b border-[#16213e]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748b]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full bg-[#0a0a1a] border border-[#16213e] rounded pl-8 pr-3 py-1.5 text-sm outline-none focus:border-[#3b82f6]"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {contacts.length === 0 ? (
            <div className="p-4 text-[#94a3b8] text-sm text-center">
              No contacts yet. Waiting for peers on LAN...
            </div>
          ) : (
            contacts.map((c) => (
              <ContactItem
                key={c.id}
                contact={c}
                active={c.id === selectedId}
                onClick={() => selectContact(c.id)}
              />
            ))
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        {selected ? <ChatPane contact={selected} /> : <EmptyState />}
      </main>
    </div>
  )
}

function ContactItem({
  contact,
  active,
  onClick,
}: {
  contact: Contact
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 border-b border-[#16213e] hover:bg-[#222241] flex items-center gap-3',
        active && 'bg-[#222241]',
      )}
    >
      <div className="relative w-8 h-8 rounded-full bg-[#3b82f6] flex items-center justify-center text-sm font-semibold shrink-0">
        {contact.name.charAt(0).toUpperCase()}
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#1a1a2e]',
            contact.online ? 'bg-green-500' : 'bg-gray-500',
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{contact.name}</div>
        <div className="text-xs text-[#64748b] truncate">{contact.ip_address}</div>
      </div>
    </button>
  )
}

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center text-[#94a3b8]">
      <div className="text-center">
        <div className="text-4xl mb-4">💬</div>
        <div>Select a contact to start chatting</div>
      </div>
    </div>
  )
}

function ChatPane({ contact }: { contact: Contact }) {
  const messages = useMessagesStore(selectMessages(contact.id))
  const sendMessage = useMessagesStore((s) => s.sendMessage)
  const sending = useMessagesStore((s) => s.sending)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const onSend = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setDraft('')
    try {
      await sendMessage(contact.id, text)
    } catch (err) {
      console.error('send failed', err)
    }
  }

  return (
    <>
      <div className="p-4 border-b border-[#16213e] bg-[#1a1a2e]">
        <div className="text-sm font-semibold">{contact.name}</div>
        <div className="text-xs text-[#64748b]">
          {contact.online ? 'Online' : 'Offline'} · {contact.ip_address}
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="text-center text-[#64748b] text-sm mt-8">
            No messages yet
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble key={m.id} msg={m} mine={m.sender_id !== contact.id} />
          ))
        )}
      </div>
      <div className="p-3 border-t border-[#16213e] bg-[#1a1a2e] flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault()
              onSend()
            }
          }}
          placeholder="Type a message..."
          className="flex-1 bg-[#0a0a1a] border border-[#16213e] rounded px-3 py-2 text-sm outline-none focus:border-[#3b82f6]"
        />
        <button
          onClick={onSend}
          disabled={!draft.trim() || sending}
          className="bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed rounded px-4 flex items-center gap-1 text-sm"
        >
          <Send className="w-4 h-4" />
          Send
        </button>
      </div>
    </>
  )
}

function MessageBubble({ msg, mine }: { msg: StoredMessage; mine: boolean }) {
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[70%] rounded-lg px-3 py-2 text-sm',
          mine
            ? 'bg-[#3b82f6] text-white'
            : 'bg-[#1a1a2e] text-[#e2e8f0] border border-[#16213e]',
        )}
      >
        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
        <div
          className={cn(
            'text-[10px] mt-1',
            mine ? 'text-blue-200' : 'text-[#64748b]',
          )}
        >
          {formatTime(msg.timestamp)}
          {mine && msg.status === 'sending' && ' · sending'}
          {mine && msg.status === 'failed' && ' · failed'}
        </div>
      </div>
    </div>
  )
}
