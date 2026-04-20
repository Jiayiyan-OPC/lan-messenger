import { Avatar } from '../ui/Avatar'
import { formatTime } from '../../lib/format'
import { cn } from '../../lib/cn'
import type { Contact } from '../../types'

interface ContactItemProps {
  contact: Contact
  selected: boolean
  onClick: () => void
}

export function ContactItem({ contact, selected, onClick }: ContactItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150',
        selected ? 'bg-[#0f3460]' : 'hover:bg-[#16213e]',
      )}
    >
      <Avatar name={contact.name} online={contact.online} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[#e0e0e0]">{contact.name}</div>
        <div className="flex items-center gap-2 text-xs text-[#666]">
          <span className="truncate">{contact.ip_address}</span>
          {!contact.online && <span>{formatTime(contact.last_seen)}</span>}
        </div>
      </div>
    </button>
  )
}
