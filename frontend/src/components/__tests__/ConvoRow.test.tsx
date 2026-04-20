import { describe, it, expect, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

import { render, screen } from '@testing-library/react'
import { ConvoRow } from '../Sidebar/ConvoRow'
import type { Contact, StoredMessage } from '../../types'

const peer: Contact = {
  id: 'peer-1',
  name: 'Mia',
  ip_address: '192.168.1.2',
  port: 9876,
  online: true,
  last_seen: Date.now(),
  created_at: Date.now(),
}

const msg: StoredMessage = {
  id: 'm1',
  sender_id: 'peer-1',
  recipient_id: 'me',
  content: 'hello world',
  timestamp: Date.now(),
  status: 'delivered',
}

describe('ConvoRow', () => {
  it('renders unread capsule when unread > 0', () => {
    render(
      <ConvoRow
        contact={peer}
        active={false}
        pinned={false}
        lastMsg={msg}
        unread={3}
        onClick={() => {}}
      />,
    )
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Mia')).toBeInTheDocument()
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })

  it('omits unread capsule when unread = 0', () => {
    render(
      <ConvoRow
        contact={peer}
        active={false}
        pinned={false}
        lastMsg={msg}
        unread={0}
        onClick={() => {}}
      />,
    )
    // Only the "hello world" preview plus "Mia" name — no lone number node.
    expect(screen.queryByText('0')).toBeNull()
  })

  it('clamps >99 to 99+', () => {
    render(
      <ConvoRow
        contact={peer}
        active
        pinned
        lastMsg={msg}
        unread={142}
        onClick={() => {}}
      />,
    )
    expect(screen.getByText('99+')).toBeInTheDocument()
  })
})
