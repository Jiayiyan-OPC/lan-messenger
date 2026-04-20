import { useState } from 'react'
import { useContactsStore } from '../../stores/contacts'
import { useTransfersStore } from '../../stores/transfers'
import { useUiStore } from '../../stores/ui'
import { PeerHero } from './PeerHero'
import { QuickActions } from './QuickActions'
import { DetailTabs } from './Tabs'
import { FileList } from './FileList'
import { InfoList } from './InfoList'
import type { DetailTab } from '../../types'

export function DetailPanel() {
  const detailOpen = useUiStore((s) => s.detailOpen)
  const activeConvoId = useUiStore((s) => s.activeConvoId)
  const contact = useContactsStore((s) =>
    s.contacts.find((c) => c.id === activeConvoId),
  )
  const fileCount = useTransfersStore(
    (s) => s.transfers.filter((t) => !t.peer_id || t.peer_id === activeConvoId).length,
  )
  const [tab, setTab] = useState<DetailTab>('files')

  if (!detailOpen || !contact) return null

  return (
    <aside
      className="flex flex-col"
      style={{
        width: 320,
        flexShrink: 0,
        background: 'var(--surface-window)',
        borderLeft: '1px solid var(--border-soft)',
      }}
    >
      <PeerHero contact={contact} />
      <QuickActions peerId={contact.id} onSelectTab={setTab} />
      <DetailTabs value={tab} onChange={setTab} fileCount={fileCount} />
      <div className="flex-1 overflow-y-auto px-[14px] pb-4 pt-[10px]">
        {tab === 'files' ? <FileList peerId={contact.id} /> : <InfoList contact={contact} />}
      </div>
    </aside>
  )
}
