import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { contacts as contactsApi, events } from '../ipc'
import type { Contact } from '../storage'

export const useContactsStore = defineStore('contacts', () => {
  const contacts = ref<Contact[]>([])
  const selectedContactId = ref<string | null>(null)
  const searchQuery = ref('')

  const onlineContacts = computed(() => contacts.value.filter((c) => c.online))

  const filteredContacts = computed(() => {
    const q = searchQuery.value.toLowerCase()
    if (!q) return contacts.value
    return contacts.value.filter(
      (c) => c.name.toLowerCase().includes(q) || c.ipAddress.toLowerCase().includes(q),
    )
  })

  const selectedContact = computed(() =>
    contacts.value.find((c) => c.id === selectedContactId.value) ?? null,
  )

  async function fetchContacts() {
    contacts.value = await contactsApi.getAll()
  }

  function selectContact(id: string) {
    selectedContactId.value = id
  }

  function setupListeners() {
    events.onPeerFound((peer) => {
      const existing = contacts.value.find((c) => c.id === peer.id)
      if (existing) {
        existing.online = true
        existing.name = peer.name
        existing.ipAddress = peer.ip_address
        existing.port = peer.port
      } else {
        contacts.value.push({
          id: peer.id,
          name: peer.name,
          ipAddress: peer.ip_address,
          port: peer.port,
          online: true,
          lastSeen: Date.now(),
          createdAt: Date.now(),
        })
      }
    })

    events.onPeerLost((peerId) => {
      const contact = contacts.value.find((c) => c.id === peerId)
      if (contact) {
        contact.online = false
        contact.lastSeen = Date.now()
      }
    })
  }

  return {
    contacts,
    selectedContactId,
    searchQuery,
    onlineContacts,
    filteredContacts,
    selectedContact,
    fetchContacts,
    selectContact,
    setupListeners,
  }
})
