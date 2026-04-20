import { Settings } from 'lucide-react'
import { Avatar } from '../primitives/Avatar'
import { useAppStore } from '../../stores/app'
import { useUiStore } from '../../stores/ui'

export function SelfRow() {
  const info = useAppStore((s) => s.deviceInfo)
  const pushToast = useUiStore((s) => s.pushToast)

  const id = info?.id ?? 'me'
  const name = info?.name ?? '你'
  const host = info?.hostname ?? ''
  const ip = info?.ip ?? ''

  return (
    <div
      className="flex items-center gap-[10px] px-[14px] py-[10px]"
      style={{
        background: 'var(--surface-footer)',
        borderTop: '1px solid var(--border-soft)',
      }}
    >
      <Avatar id={id} name={name} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-bold text-[var(--text-primary)]">
          你 · {name}
        </div>
        <div className="truncate font-mono text-[10.5px] text-[var(--text-muted)]">
          {ip ? ip : '探测本机 IP…'}
          {host ? ` · ${host}` : ''}
        </div>
      </div>
      <button
        type="button"
        title="设置"
        onClick={() => pushToast({ kind: 'info', title: '设置', body: '敬请期待' })}
        className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[var(--text-secondary)] transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <Settings size={15} strokeWidth={1.8} />
      </button>
    </div>
  )
}
