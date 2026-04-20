import { formatClock } from '../../lib/format'
import { hostnameFor } from '../../lib/peer'
import type { Contact } from '../../types'

interface InfoListProps {
  contact: Contact
}

interface Row {
  label: string
  value: string
  mono: boolean
}

function prettyOs(os: string | undefined | null): string {
  if (!os) return '未知'
  const s = os.toLowerCase()
  if (s.includes('mac') || s === 'darwin') return 'macOS'
  if (s.includes('win')) return 'Windows'
  if (s.includes('linux')) return 'Linux'
  return os
}

export function InfoList({ contact }: InfoListProps) {
  const firstSeen = contact.created_at ? formatClock(contact.created_at) : '—'

  const rows: Row[] = [
    { label: '主机名', value: hostnameFor(contact) || '—', mono: true },
    { label: 'IP 地址', value: contact.ip_address || '—', mono: true },
    { label: '系统', value: prettyOs(contact.os), mono: false },
    { label: '延迟', value: '—', mono: true },
    { label: '加密', value: '局域网直连', mono: false },
    { label: '首次发现', value: firstSeen, mono: false },
  ]

  return (
    <div
      className="overflow-hidden rounded-[14px]"
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid rgba(30,42,51,0.05)',
      }}
    >
      {rows.map((r, i) => (
        <div
          key={r.label}
          className="flex items-center gap-[10px] px-[14px] py-[10px]"
          style={i === 0 ? undefined : { borderTop: '1px solid rgba(30,42,51,0.05)' }}
        >
          <div className="w-[72px] text-[12px] font-medium text-[var(--text-muted)]">{r.label}</div>
          <div
            className={
              r.mono
                ? 'flex-1 text-right font-mono text-[12.5px] font-medium text-[var(--text-primary)]'
                : 'flex-1 text-right text-[12.5px] font-medium text-[var(--text-primary)]'
            }
          >
            {r.value}
          </div>
        </div>
      ))}
    </div>
  )
}
