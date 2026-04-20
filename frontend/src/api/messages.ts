import { invoke } from '@tauri-apps/api/core'
import type { StoredMessage } from '../types'

export const messages = {
  query: (contactId?: string, limit?: number, offset?: number) =>
    invoke<StoredMessage[]>('get_messages', { contactId, limit, offset }),

  getById: (id: string) => invoke<StoredMessage | null>('get_message', { id }),

  send: (recipientId: string, content: string) =>
    invoke<StoredMessage>('send_message', {
      request: { recipient_id: recipientId, content },
    }),

  delete: (id: string) => invoke<void>('delete_message', { id }),

  deleteByContact: (contactId: string) =>
    invoke<void>('delete_messages_by_contact', { contactId }),
}
