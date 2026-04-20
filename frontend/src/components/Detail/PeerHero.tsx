import { Wifi } from 'lucide-react'
import { Avatar } from '../primitives/Avatar'
import { hostnameFor } from '../../lib/peer'
import type { Contact } from '../../types'

interface PeerHeroProps {
  contact: Contact
}

export function PeerHero({ contact }: PeerHeroProps) {
  return (
    <div
      className="flex flex-col items-center px-5 pt-6 pb-4"
      style={{
        background: 'linear-gradient(180deg, var(--surface-sidebar) 0%, var(--surface-window) 100%)',
        borderBottom: '1px solid var(--border-soft)',
      }}
    >
      <div className="relative">
        <Avatar id={contact.id} name={contact.name} size={72} ringColor="var(--surface-window)" />
        {contact.online && (
          <span
            aria-hidden
            className="absolute bottom-[2px] right-[2px] h-4 w-4 rounded-full"
            style={{
              background: 'var(--online)',
              boxShadow: '0 0 0 3px var(--surface-window)',
            }}
          />
        )}
      </div>
      <div
        className="mt-[10px] text-[17px] font-bold text-[var(--text-primary)]"
        style={{ letterSpacing: '-0.3px' }}
      >
        {contact.name}
      </div>
      <div className="mt-[2px] text-[12px] text-[var(--text-muted)]">
        {contact.online ? '在线 · LAN 直连' : '离线'}
      </div>
      <div
        className="mt-[6px] inline-flex items-center gap-[6px] rounded-[8px] px-[10px] py-1 font-mono text-[11px] text-[var(--text-muted)]"
        style={{ background: 'rgba(30,42,51,0.04)' }}
      >
        <Wifi size={12} strokeWidth={1.8} />
        {hostnameFor(contact)} · {contact.ip_address}
      </div>
    </div>
  )
}
