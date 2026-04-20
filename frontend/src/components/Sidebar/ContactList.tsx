import { useContactsStore, selectFilteredContacts } from '../../stores/contacts'
import { ContactItem } from './ContactItem'

export function ContactList() {
  const contacts = useContactsStore(selectFilteredContacts)
  const selectedId = useContactsStore((s) => s.selectedId)
  const select = useContactsStore((s) => s.select)
  const searchQuery = useContactsStore((s) => s.searchQuery)

  if (contacts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-3 text-center text-sm text-[#666]">
        {searchQuery
          ? `No contacts match "${searchQuery}"`
          : 'No devices found on the network'}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {contacts.map((c) => (
        <ContactItem
          key={c.id}
          contact={c}
          selected={c.id === selectedId}
          onClick={() => select(c.id)}
        />
      ))}
    </div>
  )
}
