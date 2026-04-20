import { MessageSquare } from 'lucide-react'
import { Avatar } from '../primitives/Avatar'
import { OsBadge } from '../primitives/OsBadge'
import { hostnameFor } from '../../lib/peer'
import type { Contact } from '../../types'

interface DeviceRowProps {
  contact: Contact
  onStart: () => void
}

export function DeviceRow({ contact, onStart }: DeviceRowProps) {
  return (
    <button
      type="button"
      onClick={onStart}
      className="flex w-full items-center gap-3 rounded-[14px] px-3 py-[10px] text-left transition-colors hover:bg-[rgba(30,42,51,0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      <Avatar
        id={contact.id}
        name={contact.name}
        size={38}
        online={contact.online}
        ringColor="var(--surface-sidebar)"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[6px]">
          <div className="min-w-0 truncate text-[14px] font-semibold text-[var(--text-primary)]">
            {contact.name}
          </div>
          <OsBadge os={contact.os} />
        </div>
        <div className="mt-[1px] truncate font-mono text-[11.5px] text-[var(--text-muted)]">
          {hostnameFor(contact)} · {contact.ip_address}
        </div>
      </div>
      <span
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] text-[var(--text-secondary)]"
        style={{ background: 'rgba(30,42,51,0.05)' }}
      >
        <MessageSquare size={14} strokeWidth={1.8} />
      </span>
    </button>
  )
}
