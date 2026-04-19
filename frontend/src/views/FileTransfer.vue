<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTransfersStore, type Transfer } from '../stores/transfers'
import { useContactsStore } from '../stores/contacts'

const transfersStore = useTransfersStore()
const contactsStore = useContactsStore()

const fileInput = ref<HTMLInputElement | null>(null)

onMounted(() => {
  transfersStore.setupListeners()
})

function triggerFilePicker() {
  fileInput.value?.click()
}

async function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !contactsStore.selectedContactId) return

  // In Tauri, we'd use the dialog API. For now, use the file path.
  // Note: web File API doesn't give real path; Tauri dialog does.
  await transfersStore.sendFile(
    contactsStore.selectedContactId,
    (file as any).path ?? file.name, // Tauri provides path
    file.name,
    file.size,
  )
  input.value = ''
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatSpeed(transfer: Transfer): string {
  // Rough estimate — in production we'd track time intervals
  if (transfer.bytesTransferred === 0) return ''
  return formatFileSize(transfer.bytesTransferred) + ' transferred'
}

function statusIcon(status: string): string {
  switch (status) {
    case 'completed': return '✅'
    case 'failed': return '❌'
    case 'rejected': return '🚫'
    case 'cancelled': return '⚪'
    case 'transferring': return '📤'
    case 'pending': return '⏳'
    default: return '📄'
  }
}

function getPeerName(peerId: string): string {
  const contact = contactsStore.contacts.find((c) => c.id === peerId)
  return contact?.name ?? peerId.slice(0, 8)
}

async function cancelTransfer(transferId: string) {
  await transfersStore.rejectTransfer(transferId)
}
</script>

<template>
  <div class="file-transfer">
    <div class="transfer-header">
      <h3>File Transfer</h3>
      <button
        class="send-file-btn"
        :disabled="!contactsStore.selectedContactId"
        @click="triggerFilePicker"
      >
        📎 Send File
      </button>
      <input ref="fileInput" type="file" hidden @change="handleFileSelect" />
    </div>

    <!-- Active transfers -->
    <div v-if="transfersStore.activeTransfers.length > 0" class="section">
      <h4 class="section-title">Active</h4>
      <div
        v-for="t in transfersStore.activeTransfers"
        :key="t.id"
        class="transfer-item active"
      >
        <div class="transfer-icon">{{ statusIcon(t.status) }}</div>
        <div class="transfer-info">
          <div class="transfer-name">{{ t.fileName }}</div>
          <div class="transfer-meta">
            <span>{{ t.direction === 'send' ? '→' : '←' }} {{ getPeerName(t.peerId) }}</span>
            <span>{{ formatFileSize(t.fileSize) }}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${t.progress * 100}%` }" />
          </div>
          <div class="transfer-progress-text">
            {{ (t.progress * 100).toFixed(1) }}% — {{ formatSpeed(t) }}
          </div>
        </div>
        <button class="cancel-btn" @click="cancelTransfer(t.id)">✕</button>
      </div>
    </div>

    <!-- Completed / history -->
    <div class="section">
      <h4 class="section-title">History</h4>
      <div
        v-for="t in transfersStore.transfers.filter(
          (t) => t.status !== 'pending' && t.status !== 'transferring',
        )"
        :key="t.id"
        class="transfer-item"
      >
        <div class="transfer-icon">{{ statusIcon(t.status) }}</div>
        <div class="transfer-info">
          <div class="transfer-name">{{ t.fileName }}</div>
          <div class="transfer-meta">
            <span>{{ t.direction === 'send' ? '→' : '←' }} {{ getPeerName(t.peerId) }}</span>
            <span>{{ formatFileSize(t.fileSize) }}</span>
            <span class="transfer-status">{{ t.status }}</span>
          </div>
        </div>
      </div>

      <div
        v-if="transfersStore.transfers.filter((t) => t.status !== 'pending' && t.status !== 'transferring').length === 0"
        class="empty-state"
      >
        <p>No transfer history</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-transfer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #16213e;
  padding: 16px;
  overflow-y: auto;
}

.transfer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.transfer-header h3 {
  color: #e0e0e0;
  font-size: 18px;
  margin: 0;
}

.send-file-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: #533483;
  color: white;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.send-file-btn:hover:not(:disabled) {
  background: #6c44a2;
}

.send-file-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.section {
  margin-bottom: 20px;
}

.section-title {
  color: #888;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 8px 0;
}

.transfer-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  background: #1a1a2e;
  margin-bottom: 6px;
}

.transfer-item.active {
  border-left: 3px solid #4ecca3;
}

.transfer-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.transfer-info {
  flex: 1;
  min-width: 0;
}

.transfer-name {
  color: #e0e0e0;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.transfer-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #666;
  margin-top: 2px;
}

.transfer-status {
  text-transform: capitalize;
}

.progress-bar {
  height: 4px;
  background: #0f3460;
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #4ecca3;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.transfer-progress-text {
  font-size: 11px;
  color: #4ecca3;
  margin-top: 2px;
}

.cancel-btn {
  background: none;
  border: none;
  color: #e74c3c;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.cancel-btn:hover {
  background: rgba(231, 76, 60, 0.15);
}

.empty-state {
  text-align: center;
  color: #555;
  padding: 16px;
  font-size: 14px;
}
</style>
