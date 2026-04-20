import { invoke } from '@tauri-apps/api/core'
import type { Contact } from '../types'

export const contacts = {
  getAll: () => invoke<Contact[]>('get_contacts'),
  getOnline: () => invoke<Contact[]>('get_online_contacts'),
  getById: (id: string) => invoke<Contact | null>('get_contact', { id }),
  delete: (id: string) => invoke<void>('delete_contact', { id }),
}
