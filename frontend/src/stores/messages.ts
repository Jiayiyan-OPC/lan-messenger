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

    // Subscribe to sent message confirmations
    listen<StoredMessage>('message-sent', (e) => {
      const msg = e.payload
      const contactId = msg.recipient_id
      set((s) => {
        const existing = s.messagesByContact[contactId] ?? []
        const updated = existing.map((m) =>
          m.id === msg.id ? { ...m, status: msg.status } : m,
        )
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
    set({ sending: true })
    try {
      const msg = await api.send(contactId, content)
      set((s) => ({
        messagesByContact: {
          ...s.messagesByContact,
          [contactId]: [...(s.messagesByContact[contactId] ?? []), msg],
        },
      }))
    } finally {
      set({ sending: false })
    }
  },
}))

// Selectors
export const selectMessages = (contactId: string | null) => (s: MessagesState) =>
  contactId ? (s.messagesByContact[contactId] ?? []) : []
