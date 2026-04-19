import { describe, it, expect, beforeEach } from 'vitest'
import { createInMemoryStorage, DeliveryStatus, TransferStatus } from '../index'
import type { Storage, Contact, StoredMessage, FileTransfer } from '../index'

let storage: Storage

beforeEach(async () => {
  storage = createInMemoryStorage()
  await storage.initialize()
})

const makeContact = (id = 'device-1'): Contact => ({
  id,
  name: 'Test Device',
  ipAddress: '192.168.1.100',
  port: 9876,
  online: true,
  lastSeen: Date.now(),
  createdAt: Date.now(),
})

const makeMessage = (id = 'msg-1', senderId = 'device-1', recipientId = 'device-2'): StoredMessage => ({
  id,
  senderId,
  recipientId,
  content: 'Hello',
  timestamp: Date.now(),
  status: DeliveryStatus.Sent,
})

const makeTransfer = (id = 'transfer-1', messageId = 'msg-1'): FileTransfer => ({
  id,
  messageId,
  fileName: 'test.txt',
  fileSize: 1024,
  checksum: 'sha256-abc',
  status: TransferStatus.Pending,
  bytesTransferred: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
})

describe('ContactRepository', () => {
  it('should upsert and retrieve a contact', async () => {
    const contact = makeContact()
    await storage.contacts.upsert(contact)
    const result = await storage.contacts.getById(contact.id)
    expect(result).toEqual(contact)
  })

  it('should return null for non-existent contact', async () => {
    expect(await storage.contacts.getById('nope')).toBeNull()
  })

  it('should get all contacts', async () => {
    await storage.contacts.upsert(makeContact('a'))
    await storage.contacts.upsert(makeContact('b'))
    const all = await storage.contacts.getAll()
    expect(all).toHaveLength(2)
  })

  it('should get online contacts', async () => {
    const online = makeContact('a')
    const offline = { ...makeContact('b'), online: false }
    await storage.contacts.upsert(online)
    await storage.contacts.upsert(offline)
    const result = await storage.contacts.getOnline()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
  })

  it('should delete a contact', async () => {
    await storage.contacts.upsert(makeContact())
    await storage.contacts.delete('device-1')
    expect(await storage.contacts.getById('device-1')).toBeNull()
  })

  it('should update online status', async () => {
    await storage.contacts.upsert(makeContact())
    await storage.contacts.setOnline('device-1', false)
    const c = await storage.contacts.getById('device-1')
    expect(c!.online).toBe(false)
  })

  it('should upsert (update existing)', async () => {
    await storage.contacts.upsert(makeContact())
    await storage.contacts.upsert({ ...makeContact(), name: 'Updated' })
    const c = await storage.contacts.getById('device-1')
    expect(c!.name).toBe('Updated')
  })
})

describe('MessageRepository', () => {
  it('should insert and retrieve a message', async () => {
    const msg = makeMessage()
    await storage.messages.insert(msg)
    expect(await storage.messages.getById(msg.id)).toEqual(msg)
  })

  it('should return null for non-existent message', async () => {
    expect(await storage.messages.getById('nope')).toBeNull()
  })

  it('should query by contact', async () => {
    await storage.messages.insert(makeMessage('m1', 'alice', 'bob'))
    await storage.messages.insert(makeMessage('m2', 'bob', 'alice'))
    await storage.messages.insert(makeMessage('m3', 'charlie', 'dave'))
    const result = await storage.messages.query({ contactId: 'alice' })
    expect(result).toHaveLength(2)
  })

  it('should query with limit and offset', async () => {
    for (let i = 0; i < 10; i++) {
      await storage.messages.insert({
        ...makeMessage(`m${i}`),
        timestamp: 1000 + i,
      })
    }
    const result = await storage.messages.query({ limit: 3, offset: 2 })
    expect(result).toHaveLength(3)
  })

  it('should query with before/after', async () => {
    await storage.messages.insert({ ...makeMessage('m1'), timestamp: 100 })
    await storage.messages.insert({ ...makeMessage('m2'), timestamp: 200 })
    await storage.messages.insert({ ...makeMessage('m3'), timestamp: 300 })
    const result = await storage.messages.query({ before: 250, after: 50 })
    expect(result).toHaveLength(2)
  })

  it('should update status', async () => {
    await storage.messages.insert(makeMessage())
    await storage.messages.updateStatus('msg-1', DeliveryStatus.Read)
    const msg = await storage.messages.getById('msg-1')
    expect(msg!.status).toBe(DeliveryStatus.Read)
  })

  it('should delete a message', async () => {
    await storage.messages.insert(makeMessage())
    await storage.messages.delete('msg-1')
    expect(await storage.messages.getById('msg-1')).toBeNull()
  })

  it('should delete by contact', async () => {
    await storage.messages.insert(makeMessage('m1', 'alice', 'bob'))
    await storage.messages.insert(makeMessage('m2', 'bob', 'alice'))
    await storage.messages.insert(makeMessage('m3', 'charlie', 'dave'))
    await storage.messages.deleteByContact('alice')
    const all = await storage.messages.query({})
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('m3')
  })
})

describe('FileTransferRepository', () => {
  it('should insert and retrieve a transfer', async () => {
    const t = makeTransfer()
    await storage.fileTransfers.insert(t)
    expect(await storage.fileTransfers.getById(t.id)).toEqual(t)
  })

  it('should return null for non-existent transfer', async () => {
    expect(await storage.fileTransfers.getById('nope')).toBeNull()
  })

  it('should update progress', async () => {
    await storage.fileTransfers.insert(makeTransfer())
    await storage.fileTransfers.updateProgress('transfer-1', 512, TransferStatus.InProgress)
    const t = await storage.fileTransfers.getById('transfer-1')
    expect(t!.bytesTransferred).toBe(512)
    expect(t!.status).toBe(TransferStatus.InProgress)
  })

  it('should set local path', async () => {
    await storage.fileTransfers.insert(makeTransfer())
    await storage.fileTransfers.setLocalPath('transfer-1', '/downloads/test.txt')
    const t = await storage.fileTransfers.getById('transfer-1')
    expect(t!.localPath).toBe('/downloads/test.txt')
  })

  it('should get by message ID', async () => {
    await storage.fileTransfers.insert(makeTransfer('t1', 'msg-A'))
    await storage.fileTransfers.insert(makeTransfer('t2', 'msg-B'))
    const result = await storage.fileTransfers.getByMessageId('msg-A')
    expect(result!.id).toBe('t1')
  })

  it('should return null for non-existent message ID', async () => {
    expect(await storage.fileTransfers.getByMessageId('nope')).toBeNull()
  })
})
