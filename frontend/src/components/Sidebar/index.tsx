import { useEffect } from 'react'
import { useContactsStore } from '../../stores/contacts'
import { useMessagesStore } from '../../stores/messages'
import { useUiStore } from '../../stores/ui'
import { Brand } from './Brand'
import { SearchBar } from './SearchBar'
import { Tabs } from './Tabs'
import { ConvoList } from './ConvoList'
import { DeviceList } from './DeviceList'
import { SelfRow } from './SelfRow'

export function Sidebar() {
  const initContacts = useContactsStore((s) => s.init)
  const initMessages = useMessagesStore((s) => s.init)
  const searchQuery = useContactsStore((s) => s.searchQuery)
  const setSearch = useContactsStore((s) => s.setSearch)

  const sidebarTab = useUiStore((s) => s.sidebarTab)
  const setSidebarTab = useUiStore((s) => s.setSidebarTab)

  const contacts = useContactsStore((s) => s.contacts)
  const deviceCount = contacts.filter((c) => c.online).length

  useEffect(() => {
    initContacts()
    initMessages()
  }, [initContacts, initMessages])

  return (
    <aside
      className="flex flex-col"
      style={{
        width: 320,
        flexShrink: 0,
        background: 'var(--surface-sidebar)',
        borderRight: '1px solid var(--border-soft)',
      }}
    >
      <Brand />
      <SearchBar value={searchQuery} onChange={setSearch} />
      <Tabs
        value={sidebarTab}
        onChange={setSidebarTab}
        chatBadge={0}
        deviceBadge={deviceCount}
      />
      <div className="flex-1 overflow-y-auto px-[10px] pb-3 pt-1">
        {sidebarTab === 'chats' ? (
          <ConvoList searchQuery={searchQuery} />
        ) : (
          <DeviceList searchQuery={searchQuery} />
        )}
      </div>
      <SelfRow />
    </aside>
  )
}
