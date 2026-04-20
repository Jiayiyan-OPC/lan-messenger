import { useMemo } from 'react'
import { useContactsStore } from '../../stores/contacts'
import { useMessagesStore } from '../../stores/messages'
import { useUiStore } from '../../stores/ui'
import { ConvoRow } from './ConvoRow'
import { hostnameFor } from '../../lib/peer'
import type { Contact, StoredMessage } from '../../types'

interface ConvoListProps {
  searchQuery: string
}

function lastMessageFor(list: StoredMessage[]): StoredMessage | undefined {
  if (!list.length) return undefined
  return list[list.length - 1]
}

function matchesQuery(c: Contact, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return (
    c.name.toLowerCase().includes(needle) ||
    c.ip_address.toLowerCase().includes(needle) ||
    hostnameFor(c).toLowerCase().includes(needle)
  )
}

export function ConvoList({ searchQuery }: ConvoListProps) {
  const contacts = useContactsStore((s) => s.contacts)
  const messagesByContact = useMessagesStore((s) => s.messagesByContact)
  const activeConvoId = useUiStore((s) => s.activeConvoId)
  const pinnedIds = useUiStore((s) => s.pinnedIds)
  const setActiveConvo = useUiStore((s) => s.setActiveConvo)

  // Contacts with a message history OR manually pinned — those are "conversations".
  const convos = useMemo(() => {
    const filtered = contacts.filter((c) => matchesQuery(c, searchQuery))
    // Keep *every* known contact as a potential convo (minimal friction in LAN).
    return filtered
      .map((c) => ({ c, last: lastMessageFor(messagesByContact[c.id] ?? []) }))
      .sort((a, b) => {
        const ap = pinnedIds.has(a.c.id) ? 1 : 0
        const bp = pinnedIds.has(b.c.id) ? 1 : 0
        if (ap !== bp) return bp - ap
        const at = a.last?.timestamp ?? a.c.last_seen ?? 0
        const bt = b.last?.timestamp ?? b.c.last_seen ?? 0
        return bt - at
      })
  }, [contacts, messagesByContact, searchQuery, pinnedIds])

  if (convos.length === 0) {
    return (
      <div className="px-3 py-10 text-center text-[13px] text-[var(--text-hint)]">
        {searchQuery ? '没有匹配的会话' : '等待局域网内设备…'}
      </div>
    )
  }

  const pinned = convos.filter((x) => pinnedIds.has(x.c.id))
  const others = convos.filter((x) => !pinnedIds.has(x.c.id))

  return (
    <div className="flex flex-col gap-[2px]">
      {pinned.length > 0 && <SectionLabel>置顶</SectionLabel>}
      {pinned.map(({ c, last }) => (
        <ConvoRow
          key={c.id}
          contact={c}
          active={c.id === activeConvoId}
          pinned
          lastMsg={last}
          unread={0}
          onClick={() => setActiveConvo(c.id)}
        />
      ))}
      {others.length > 0 && <SectionLabel>所有会话</SectionLabel>}
      {others.map(({ c, last }) => (
        <ConvoRow
          key={c.id}
          contact={c}
          active={c.id === activeConvoId}
          pinned={false}
          lastMsg={last}
          unread={0}
          onClick={() => setActiveConvo(c.id)}
        />
      ))}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-3 pt-3 pb-[6px] text-[10.5px] font-bold uppercase text-[var(--text-hint)]"
      style={{ letterSpacing: '0.6px' }}
    >
      {children}
    </div>
  )
}
