<script setup lang="ts">
import { ref } from 'vue'
import ContactList from './views/ContactList.vue'
import ChatView from './views/ChatView.vue'
import FileTransfer from './views/FileTransfer.vue'

const activeTab = ref<'chat' | 'files'>('chat')
</script>

<template>
  <div class="app-layout">
    <ContactList />
    <div class="main-area">
      <div class="tab-bar">
        <button
          :class="['tab', { active: activeTab === 'chat' }]"
          @click="activeTab = 'chat'"
        >
          💬 Chat
        </button>
        <button
          :class="['tab', { active: activeTab === 'files' }]"
          @click="activeTab = 'files'"
        >
          📁 Files
        </button>
      </div>
      <ChatView v-if="activeTab === 'chat'" />
      <FileTransfer v-else />
    </div>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0a0a1a;
}
</style>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
}

.main-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.tab-bar {
  display: flex;
  background: #1a1a2e;
  border-bottom: 1px solid #16213e;
}

.tab {
  padding: 10px 20px;
  border: none;
  background: transparent;
  color: #888;
  font-size: 14px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}

.tab:hover {
  color: #ccc;
}

.tab.active {
  color: #e0e0e0;
  border-bottom-color: #533483;
}
</style>
