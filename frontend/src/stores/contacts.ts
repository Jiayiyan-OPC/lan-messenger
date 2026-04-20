import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import { contacts as api } from '../api/contacts'
import type { Contact } from '../types'

interface ContactsState {
  contacts: Contact[]
  searchQuery: string
  selectedId: string | null
  initialized: boolean

  init: () => Promise<void>
  setSearch: (q: string) => void
  select: (id: string | null) => void

  // Derived getters via selectors (not stored)
}

export const useContactsStore = create<ContactsState>((set, get) => ({
  contacts: [],
  searchQuery: '',
  selectedId: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    const contacts = await api.getAll()
    set({ contacts, initialized: true })

    // Subscribe to discovery events
    listen<Contact>('peer-found', (e) => {
      set((s) => {
        const exists = s.contacts.some((c) => c.id === e.payload.id)
        if (exists) {
          return {
            contacts: s.contacts.map((c) =>
              c.id === e.payload.id ? { ...e.payload, online: true } : c,
            ),
          }
        }
        return { contacts: [...s.contacts, { ...e.payload, online: true }] }
      })
    })

    listen<string>('peer-lost', (e) => {
      set((s) => ({
        contacts: s.contacts.map((c) =>
          c.id === e.payload ? { ...c, online: false } : c,
        ),
      }))
    })

    listen<Contact>('peer-updated', (e) => {
      set((s) => ({
        contacts: s.contacts.map((c) =>
          c.id === e.payload.id ? { ...e.payload } : c,
        ),
      }))
    })
  },

  setSearch: (q) => set({ searchQuery: q }),
  select: (id) => set({ selectedId: id }),
}))

// Selectors
export const selectFilteredContacts = (s: ContactsState) => {
  const q = s.searchQuery.toLowerCase()
  if (!q) return s.contacts
  return s.contacts.filter(
    (c) => c.name.toLowerCase().includes(q) || c.id.includes(q),
  )
}

export const selectOnlineContacts = (s: ContactsState) =>
  s.contacts.filter((c) => c.online)

export const selectSelectedContact = (s: ContactsState) =>
  s.contacts.find((c) => c.id === s.selectedId) ?? null
