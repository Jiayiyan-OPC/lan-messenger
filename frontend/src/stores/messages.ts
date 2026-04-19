import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { messages as messagesApi, events } from '../ipc'
import type { StoredMessage } from '../storage'

export const useMessagesStore = defineStore('messages', () => {
  /** Messages keyed by contact ID */
  const messagesByContact = ref<Record<string, StoredMessage[]>>({})
  const loading = ref(false)

  function getMessages(contactId: string): StoredMessage[] {
    return messagesByContact.value[contactId] ?? []
  }

  async function fetchMessages(contactId: string, limit = 50, offset = 0) {
    loading.value = true
    try {
      const msgs = await messagesApi.query(contactId, limit, offset)
      // Sort ascending by timestamp for display
      msgs.sort((a, b) => a.timestamp - b.timestamp)
      if (offset === 0) {
        messagesByContact.value[contactId] = msgs
      } else {
        // Prepend older messages
        const existing = messagesByContact.value[contactId] ?? []
        messagesByContact.value[contactId] = [...msgs, ...existing]
      }
    } finally {
      loading.value = false
    }
  }

  async function sendMessage(recipientId: string, content: string) {
    const msg = await messagesApi.send(recipientId, content)
    const existing = messagesByContact.value[recipientId] ?? []
    messagesByContact.value[recipientId] = [...existing, msg]
    return msg
  }

  function setupListeners() {
    events.onMessageReceived((msg) => {
      const contactId = msg.senderId
      const existing = messagesByContact.value[contactId] ?? []
      // Avoid duplicates
      if (!existing.find((m) => m.id === msg.id)) {
        messagesByContact.value[contactId] = [...existing, msg]
      }
    })

    events.onMessageSent((msg) => {
      const contactId = msg.recipientId
      const existing = messagesByContact.value[contactId] ?? []
      const idx = existing.findIndex((m) => m.id === msg.id)
      if (idx >= 0) {
        existing[idx] = msg
        messagesByContact.value[contactId] = [...existing]
      }
    })
  }

  return {
    messagesByContact,
    loading,
    getMessages,
    fetchMessages,
    sendMessage,
    setupListeners,
  }
})
