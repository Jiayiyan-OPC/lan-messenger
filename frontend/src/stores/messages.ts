import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import { messages as api } from '../api/messages'
import type { StoredMessage } from '../types'

interface MessagesState {
  messagesByContact: Record<string, StoredMessage[]>
  sending: boolean
  initialized: boolean

  init: () => Promise<void>
  loadMessages: (contactId: string) => Promise<void>
  sendMessage: (contactId: string, content: string) => Promise<void>
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  messagesByContact: {},
  sending: false,
  initialized: false,

  init: async () => {
    if (get().initialized) return
    set({ initialized: true })

    // Subscribe to incoming messages
    listen<StoredMessage>('message-received', (e) => {
      const msg = e.payload
      const contactId = msg.sender_id
      set((s) => ({
        messagesByContact: {
          ...s.messagesByContact,
          [contactId]: [...(s.messagesByContact[contactId] ?? []), msg],
        },
      }))
    })

    // Subscribe to sent message confirmations. The listener is the SINGLE
    // insertion path for outbound messages — `sendMessage` only awaits the
    // invoke and does not touch state (see R3 dup-bubble fix). The
    // "update status if hit, else append" branch stays because remote
    // acks can still arrive before we've locally observed the message.
    listen<StoredMessage>('message-sent', (e) => {
      const msg = e.payload
      const contactId = msg.recipient_id
      set((s) => {
        const existing = s.messagesByContact[contactId] ?? []
        const hit = existing.some((m) => m.id === msg.id)
        const updated = hit
          ? existing.map((m) => (m.id === msg.id ? { ...m, status: msg.status } : m))
          : [...existing, msg]
        return {
          messagesByContact: {
            ...s.messagesByContact,
            [contactId]: updated,
          },
        }
      })
    })
  },

  loadMessages: async (contactId) => {
    const msgs = await api.query(contactId, 100, 0)
    // API returns newest first, reverse for chronological display
    set((s) => ({
      messagesByContact: {
        ...s.messagesByContact,
        [contactId]: msgs.reverse(),
      },
    }))
  },

  sendMessage: async (contactId, content) => {
    // Insertion is owned by the `message-sent` listener (see above) — sending
    // here used to also push the returned msg into state, which raced the
    // listener when the event arrived during the await and produced two
    // bubbles for the same id. The awaited Promise is retained for its
    // Tauri error path (so the caller can surface a failed-send toast) but
    // the snapshot it returns is ignored on purpose.
    set({ sending: true })
    try {
      await api.send(contactId, content)
    } finally {
      set({ sending: false })
    }
  },
}))

// Selectors
// Module-level stable reference: returning a fresh `[]` from a zustand selector
// causes `useSyncExternalStore` to see a new snapshot on every call, which
// triggers an infinite render loop ("getSnapshot should be cached").
const EMPTY_MESSAGES: StoredMessage[] = []
export const selectMessages = (contactId: string | null) => (s: MessagesState) =>
  contactId ? (s.messagesByContact[contactId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES

/** Count incoming messages for a peer whose timestamp is newer than `readAt`. */
export function countUnread(
  messagesByContact: Record<string, StoredMessage[]>,
  peerId: string,
  readAt: number,
): number {
  const list = messagesByContact[peerId]
  if (!list || list.length === 0) return 0
  let n = 0
  for (const m of list) {
    if (m.sender_id === peerId && m.timestamp > readAt) n++
  }
  return n
}
