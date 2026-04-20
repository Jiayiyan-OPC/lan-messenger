import { RefreshCw } from 'lucide-react'
import { useContactsStore } from '../../stores/contacts'
import { useUiStore } from '../../stores/ui'
import { discovery } from '../../api/discovery'
import { hostnameFor } from '../../lib/peer'
import { DeviceRow } from './DeviceRow'
import type { Contact } from '../../types'

interface DeviceListProps {
  searchQuery: string
}

function matches(c: Contact, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return (
    c.name.toLowerCase().includes(needle) ||
    c.ip_address.toLowerCase().includes(needle) ||
    hostnameFor(c).toLowerCase().includes(needle)
  )
}

export function DeviceList({ searchQuery }: DeviceListProps) {
  const contacts = useContactsStore((s) => s.contacts)
  const setActiveConvo = useUiStore((s) => s.setActiveConvo)
  const setSidebarTab = useUiStore((s) => s.setSidebarTab)
  const pushToast = useUiStore((s) => s.pushToast)

  const filtered = contacts.filter((c) => matches(c, searchQuery))
  const onlineCount = filtered.filter((c) => c.online).length

  const handleRescan = async () => {
    try {
      await discovery.start()
      pushToast({ kind: 'info', title: '重新扫描中', body: '广播已发出，等待对端响应' })
    } catch (err) {
      pushToast({ kind: 'info', title: '扫描失败', body: String(err) })
    }
  }

  return (
    <div className="flex flex-col gap-[2px]">
      <div className="flex items-center gap-2 px-3 pt-[10px] pb-2">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inset-0 rounded-full" style={{ background: 'var(--online)' }} />
          <span
            className="absolute inset-0 rounded-full animate-pulse-ring"
            style={{ background: 'var(--online)' }}
          />
        </span>
        <span className="text-[11.5px] font-semibold text-[var(--text-secondary)]">
          扫描中 · 发现 {onlineCount} 台
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleRescan}
          title="重新扫描"
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-white hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          <RefreshCw size={14} strokeWidth={1.8} />
        </button>
      </div>
      {filtered.length === 0 ? (
        <div className="px-3 py-10 text-center text-[13px] text-[var(--text-hint)]">
          {searchQuery ? '没有匹配的设备' : '等待局域网内设备…'}
        </div>
      ) : (
        filtered.map((c) => (
          <DeviceRow
            key={c.id}
            contact={c}
            onStart={() => {
              setActiveConvo(c.id)
              setSidebarTab('chats')
            }}
          />
        ))
      )}
    </div>
  )
}
