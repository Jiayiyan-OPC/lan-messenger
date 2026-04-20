import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

import { invoke } from '@tauri-apps/api/core'
import {
  useContactsStore,
  selectFilteredContacts,
  selectOnlineContacts,
  selectSelectedContact,
} from '../contacts'
import type { Contact } from '../../types'

const mockInvoke = invoke as ReturnType<typeof vi.fn>

const makeContact = (id: string, online = true): Contact => ({
  id,
  name: `Device ${id}`,
  ip_address: '192.168.1.100',
  port: 9876,
  online,
  last_seen: Date.now(),
  created_at: Date.now(),
})

beforeEach(() => {
  useContactsStore.setState({
    contacts: [],
    searchQuery: '',
    selectedId: null,
    initialized: false,
  })
  vi.clearAllMocks()
})

describe('useContactsStore', () => {
  it('should init and load contacts', async () => {
    const contacts = [makeContact('a'), makeContact('b')]
    mockInvoke.mockResolvedValue(contacts)

    await useContactsStore.getState().init()

    expect(useContactsStore.getState().contacts).toEqual(contacts)
    expect(useContactsStore.getState().initialized).toBe(true)
  })

  it('should not re-init', async () => {
    mockInvoke.mockResolvedValue([])
    await useContactsStore.getState().init()
    await useContactsStore.getState().init()
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  it('should set search query', () => {
    useContactsStore.getState().setSearch('test')
    expect(useContactsStore.getState().searchQuery).toBe('test')
  })

  it('should select contact', () => {
    useContactsStore.getState().select('abc')
    expect(useContactsStore.getState().selectedId).toBe('abc')
  })
})

describe('selectors', () => {
  it('selectFilteredContacts filters by name', () => {
    const state = {
      ...useContactsStore.getState(),
      contacts: [makeContact('a'), { ...makeContact('b'), name: 'MacBook' }],
      searchQuery: 'mac',
    }
    expect(selectFilteredContacts(state)).toHaveLength(1)
    expect(selectFilteredContacts(state)[0]!.name).toBe('MacBook')
  })

  it('selectOnlineContacts', () => {
    const state = {
      ...useContactsStore.getState(),
      contacts: [makeContact('a', true), makeContact('b', false)],
    }
    expect(selectOnlineContacts(state)).toHaveLength(1)
  })

  it('selectSelectedContact', () => {
    const state = {
      ...useContactsStore.getState(),
      contacts: [makeContact('a')],
      selectedId: 'a',
    }
    expect(selectSelectedContact(state)!.id).toBe('a')
  })

  it('selectSelectedContact returns null when not found', () => {
    const state = {
      ...useContactsStore.getState(),
      contacts: [],
      selectedId: 'nope',
    }
    expect(selectSelectedContact(state)).toBeNull()
  })
})
