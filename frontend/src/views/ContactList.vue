<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useContactsStore } from '../stores/contacts'
import { useMessagesStore } from '../stores/messages'

const contactsStore = useContactsStore()
const messagesStore = useMessagesStore()

onMounted(() => {
  contactsStore.fetchContacts()
  contactsStore.setupListeners()
})

function selectContact(id: string) {
  contactsStore.selectContact(id)
  messagesStore.fetchMessages(id)
}

function formatLastSeen(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const now = Date.now()
  const diff = now - ts
  if (diff < 60_000) return 'Just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString()
}
</script>

<template>
  <div class="contact-list">
    <div class="search-bar">
      <input
        v-model="contactsStore.searchQuery"
        type="text"
        placeholder="Search contacts..."
        class="search-input"
      />
    </div>

    <div class="contacts-header">
      <span class="header-title">Contacts</span>
      <span class="online-count">{{ contactsStore.onlineContacts.length }} online</span>
    </div>

    <div class="contacts-scroll">
      <div
        v-for="contact in contactsStore.filteredContacts"
        :key="contact.id"
        :class="['contact-item', { selected: contact.id === contactsStore.selectedContactId }]"
        @click="selectContact(contact.id)"
      >
        <div class="contact-avatar">
          <div :class="['status-dot', { online: contact.online }]" />
          <span class="avatar-text">{{ contact.name.charAt(0).toUpperCase() }}</span>
        </div>
        <div class="contact-info">
          <div class="contact-name">{{ contact.name }}</div>
          <div class="contact-meta">
            <span class="contact-ip">{{ contact.ipAddress }}</span>
            <span v-if="!contact.online" class="last-seen">{{ formatLastSeen(contact.lastSeen) }}</span>
          </div>
        </div>
      </div>

      <div v-if="contactsStore.filteredContacts.length === 0" class="empty-state">
        <p v-if="contactsStore.searchQuery">No contacts match "{{ contactsStore.searchQuery }}"</p>
        <p v-else>No devices found on the network</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.contact-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1a1a2e;
  border-right: 1px solid #16213e;
  width: 280px;
  min-width: 280px;
}

.search-bar {
  padding: 12px;
  border-bottom: 1px solid #16213e;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #16213e;
  border-radius: 8px;
  background: #0f3460;
  color: #e0e0e0;
  font-size: 14px;
  outline: none;
}

.search-input:focus {
  border-color: #533483;
}

.search-input::placeholder {
  color: #666;
}

.contacts-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  font-size: 12px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.online-count {
  color: #4ecca3;
  font-weight: 600;
}

.contacts-scroll {
  flex: 1;
  overflow-y: auto;
}

.contact-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;
  gap: 10px;
}

.contact-item:hover {
  background: #16213e;
}

.contact-item.selected {
  background: #0f3460;
}

.contact-avatar {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #533483;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-text {
  color: white;
  font-size: 16px;
  font-weight: 600;
}

.status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #666;
  border: 2px solid #1a1a2e;
}

.status-dot.online {
  background: #4ecca3;
}

.contact-info {
  flex: 1;
  min-width: 0;
}

.contact-name {
  color: #e0e0e0;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-meta {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: #666;
  margin-top: 2px;
}

.empty-state {
  padding: 24px 12px;
  text-align: center;
  color: #666;
  font-size: 14px;
}
</style>
