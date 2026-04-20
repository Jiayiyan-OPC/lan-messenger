import { Plus } from 'lucide-react'
import { useUiStore } from '../../stores/ui'
import { useDeviceInfo } from '../../hooks/useDeviceInfo'

/** Brand row: gradient logo + title + subnet subtitle + "+" button. */
export function Brand() {
  const pushToast = useUiStore((s) => s.pushToast)
  const info = useDeviceInfo()

  // "connected · 192.168.x.0/24" — derive /24 from local IP as a friendly hint.
  let subtitle = 'LinkLan · 局域网直连'
  if (info?.ip) {
    const parts = info.ip.split('.')
    if (parts.length === 4) {
      subtitle = `connected · ${parts[0]}.${parts[1]}.${parts[2]}.0/24`
    }
  }

  return (
    <div className="flex items-center gap-[10px] px-[18px] pt-[18px] pb-2">
      <div
        className="flex h-[30px] w-[30px] items-center justify-center text-white"
        style={{
          borderRadius: 9,
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)',
          fontWeight: 800,
          fontSize: 14,
          boxShadow: '0 2px 6px rgba(58,125,153,0.35)',
        }}
      >
        L
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-[15px] font-extrabold text-[var(--text-primary)]"
          style={{ letterSpacing: '-0.2px' }}
        >
          LinkLan
        </div>
        <div className="truncate font-mono text-[10.5px] text-[var(--text-muted)]">{subtitle}</div>
      </div>
      <button
        type="button"
        title="新建"
        onClick={() =>
          pushToast({
            kind: 'info',
            title: '群组功能即将上线',
            body: '当前版本仅支持一对一对话',
          })
        }
        className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-[var(--border-med)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <Plus size={15} strokeWidth={1.8} />
      </button>
    </div>
  )
}
