/**
 * Storage Layer - In-Memory Implementation
 *
 * Used for unit testing and development without SQLite.
 * Production implementation is in Rust backend via Tauri IPC.
 */

import type { Contact, StoredMessage, FileTransfer, MessageQuery } from './types'
import type {
  Storage,
  ContactRepository,
  MessageRepository,
  FileTransferRepository,
} from './repository'

class InMemoryContactRepository implements ContactRepository {
  private store = new Map<string, Contact>()

  async upsert(contact: Contact): Promise<void> {
    this.store.set(contact.id, { ...contact })
  }

  async getById(id: string): Promise<Contact | null> {
    return this.store.get(id) ?? null
  }

  async getAll(): Promise<Contact[]> {
    return Array.from(this.store.values())
  }

  async getOnline(): Promise<Contact[]> {
    return Array.from(this.store.values()).filter((c) => c.online)
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id)
  }

  async setOnline(id: string, online: boolean): Promise<void> {
    const contact = this.store.get(id)
    if (contact) {
      contact.online = online
      contact.lastSeen = Date.now()
    }
  }
}

class InMemoryMessageRepository implements MessageRepository {
  private store = new Map<string, StoredMessage>()

  async insert(message: StoredMessage): Promise<void> {
    this.store.set(message.id, { ...message })
  }

  async getById(id: string): Promise<StoredMessage | null> {
    return this.store.get(id) ?? null
  }

  async query(options: MessageQuery): Promise<StoredMessage[]> {
    let messages = Array.from(this.store.values())

    if (options.contactId) {
      messages = messages.filter(
        (m) => m.senderId === options.contactId || m.recipientId === options.contactId,
      )
    }
    if (options.before) {
      messages = messages.filter((m) => m.timestamp < options.before!)
    }
    if (options.after) {
      messages = messages.filter((m) => m.timestamp > options.after!)
    }

    // Sort by timestamp descending
    messages.sort((a, b) => b.timestamp - a.timestamp)

    if (options.offset) {
      messages = messages.slice(options.offset)
    }
    if (options.limit) {
      messages = messages.slice(0, options.limit)
    }

    return messages
  }

  async updateStatus(id: string, status: StoredMessage['status']): Promise<void> {
    const msg = this.store.get(id)
    if (msg) {
      msg.status = status
    }
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id)
  }

  async deleteByContact(contactId: string): Promise<void> {
    for (const [id, msg] of this.store) {
      if (msg.senderId === contactId || msg.recipientId === contactId) {
        this.store.delete(id)
      }
    }
  }
}

class InMemoryFileTransferRepository implements FileTransferRepository {
  private store = new Map<string, FileTransfer>()

  async insert(transfer: FileTransfer): Promise<void> {
    this.store.set(transfer.id, { ...transfer })
  }

  async getById(id: string): Promise<FileTransfer | null> {
    return this.store.get(id) ?? null
  }

  async updateProgress(
    id: string,
    bytesTransferred: number,
    status: FileTransfer['status'],
  ): Promise<void> {
    const t = this.store.get(id)
    if (t) {
      t.bytesTransferred = bytesTransferred
      t.status = status
      t.updatedAt = Date.now()
    }
  }

  async setLocalPath(id: string, localPath: string): Promise<void> {
    const t = this.store.get(id)
    if (t) {
      t.localPath = localPath
      t.updatedAt = Date.now()
    }
  }

  async getByMessageId(messageId: string): Promise<FileTransfer | null> {
    for (const t of this.store.values()) {
      if (t.messageId === messageId) return t
    }
    return null
  }
}

/**
 * Create an in-memory storage instance for testing.
 */
export function createInMemoryStorage(): Storage {
  const contacts = new InMemoryContactRepository()
  const messages = new InMemoryMessageRepository()
  const fileTransfers = new InMemoryFileTransferRepository()

  return {
    contacts,
    messages,
    fileTransfers,
    async initialize() {
      // No-op for in-memory
    },
    async close() {
      // No-op for in-memory
    },
  }
}
