import { useEffect } from 'react'
import { useContactsStore, selectOnlineContacts } from '../../stores/contacts'
import { SearchBar } from './SearchBar'
import { ContactList } from './ContactList'

export function Sidebar() {
  const init = useContactsStore((s) => s.init)
  const searchQuery = useContactsStore((s) => s.searchQuery)
  const setSearch = useContactsStore((s) => s.setSearch)
  const onlineCount = useContactsStore(selectOnlineContacts).length

  useEffect(() => { init() }, [init])

  return (
    <aside className="flex w-[280px] min-w-[280px] flex-col border-r border-[#16213e] bg-[#1a1a2e]">
      <SearchBar value={searchQuery} onChange={setSearch} />
      <div className="flex items-center justify-between px-3 py-1.5 text-xs uppercase tracking-wider text-[#888]">
        <span>Contacts</span>
        <span className="font-semibold text-[#4ecca3]">{onlineCount} online</span>
      </div>
      <ContactList />
    </aside>
  )
}
