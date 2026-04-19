<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useContactsStore } from '../stores/contacts'
import { useMessagesStore } from '../stores/messages'

const contactsStore = useContactsStore()
const messagesStore = useMessagesStore()

const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

const currentMessages = computed(() => {
  const cid = contactsStore.selectedContactId
  if (!cid) return []
  return messagesStore.getMessages(cid)
})

onMounted(() => {
  messagesStore.setupListeners()
})

// Auto-scroll on new messages
watch(currentMessages, () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}, { deep: true })

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || !contactsStore.selectedContactId) return
  inputText.value = ''
  try {
    await messagesStore.sendMessage(contactsStore.selectedContactId, text)
  } catch (e) {
    console.error('Failed to send message:', e)
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString()
}

function shouldShowDate(index: number): boolean {
  if (index === 0) return true
  const prev = currentMessages.value[index - 1]
  const curr = currentMessages.value[index]
  return new Date(prev.timestamp).toDateString() !== new Date(curr.timestamp).toDateString()
}
</script>

<template>
  <div class="chat-view">
    <!-- No contact selected -->
    <div v-if="!contactsStore.selectedContact" class="empty-chat">
      <div class="empty-icon">💬</div>
      <p>Select a contact to start chatting</p>
    </div>

    <!-- Chat active -->
    <template v-else>
      <div class="chat-header">
        <div class="header-info">
          <span class="header-name">{{ contactsStore.selectedContact.name }}</span>
          <span :class="['header-status', { online: contactsStore.selectedContact.online }]">
            {{ contactsStore.selectedContact.online ? 'Online' : 'Offline' }}
          </span>
        </div>
        <span class="header-ip">{{ contactsStore.selectedContact.ipAddress }}</span>
      </div>

      <div ref="messagesContainer" class="messages-container">
        <template v-for="(msg, index) in currentMessages" :key="msg.id">
          <div v-if="shouldShowDate(index)" class="date-separator">
            <span>{{ formatDate(msg.timestamp) }}</span>
          </div>
          <div :class="['message-bubble', msg.senderId === 'self' ? 'sent' : 'received']">
            <div class="message-content">{{ msg.content }}</div>
            <div class="message-meta">
              <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
              <span v-if="msg.senderId === 'self'" class="message-status">
                {{ msg.status === 'sent' ? '✓' : msg.status === 'delivered' ? '✓✓' : '' }}
              </span>
            </div>
          </div>
        </template>

        <div v-if="currentMessages.length === 0" class="no-messages">
          <p>No messages yet. Say hello! 👋</p>
        </div>
      </div>

      <div class="input-bar">
        <textarea
          v-model="inputText"
          class="message-input"
          placeholder="Type a message..."
          rows="1"
          @keydown="handleKeydown"
        />
        <button class="send-btn" :disabled="!inputText.trim()" @click="sendMessage">
          Send
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  background: #16213e;
}

.empty-chat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #1a1a2e;
  border-bottom: 1px solid #0f3460;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-name {
  color: #e0e0e0;
  font-size: 16px;
  font-weight: 600;
}

.header-status {
  font-size: 12px;
  color: #666;
}

.header-status.online {
  color: #4ecca3;
}

.header-ip {
  font-size: 12px;
  color: #555;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.date-separator {
  text-align: center;
  padding: 8px 0;
  color: #555;
  font-size: 12px;
}

.date-separator span {
  background: #1a1a2e;
  padding: 2px 12px;
  border-radius: 10px;
}

.message-bubble {
  max-width: 70%;
  padding: 8px 12px;
  border-radius: 12px;
  word-wrap: break-word;
}

.message-bubble.sent {
  align-self: flex-end;
  background: #533483;
  color: #e0e0e0;
  border-bottom-right-radius: 4px;
}

.message-bubble.received {
  align-self: flex-start;
  background: #0f3460;
  color: #e0e0e0;
  border-bottom-left-radius: 4px;
}

.message-content {
  font-size: 14px;
  line-height: 1.4;
  white-space: pre-wrap;
}

.message-meta {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 4px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.no-messages {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #555;
}

.input-bar {
  display: flex;
  align-items: flex-end;
  padding: 12px 16px;
  gap: 8px;
  background: #1a1a2e;
  border-top: 1px solid #0f3460;
}

.message-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #0f3460;
  border-radius: 12px;
  background: #16213e;
  color: #e0e0e0;
  font-size: 14px;
  resize: none;
  outline: none;
  max-height: 120px;
  font-family: inherit;
}

.message-input:focus {
  border-color: #533483;
}

.message-input::placeholder {
  color: #555;
}

.send-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 12px;
  background: #533483;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.send-btn:hover:not(:disabled) {
  background: #6c44a2;
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
