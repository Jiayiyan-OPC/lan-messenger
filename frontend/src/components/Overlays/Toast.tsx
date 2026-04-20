import { Check, File, Info, Laptop, X } from 'lucide-react'
import type { Toast as ToastModel } from '../../types'

interface ToastItemProps {
  toast: ToastModel
  onDismiss: () => void
}

const TINTS = {
  info: { bg: 'var(--surface-raised)', border: 'rgba(30,42,51,0.08)', icon: '#495A66' },
  success: { bg: '#EEF6EE', border: 'rgba(95,179,154,0.3)', icon: '#3F8A73' },
  file: { bg: '#E6F0F6', border: 'rgba(78,154,184,0.3)', icon: 'var(--accent-dark)' },
  peer: { bg: '#E6F0FA', border: 'rgba(78,130,168,0.3)', icon: '#4E82A8' },
} as const

export function Toast({ toast, onDismiss }: ToastItemProps) {
  const t = TINTS[toast.kind]
  const Icon =
    toast.kind === 'file' ? File : toast.kind === 'peer' ? Laptop : toast.kind === 'success' ? Check : Info
  return (
    <div
      className="pointer-events-auto flex min-w-[280px] max-w-[360px] items-start gap-[10px] rounded-[14px] px-3 py-[10px] animate-toast-in"
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: 'rgba(255,255,255,0.75)', color: t.icon }}
      >
        <Icon size={16} strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-bold text-[var(--text-primary)]">
          {toast.title}
        </div>
        {toast.body && (
          <div className="mt-[2px] truncate text-[12px] leading-[1.4] text-[var(--text-tertiary)]">
            {toast.body}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-hint)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <X size={14} strokeWidth={1.8} />
      </button>
    </div>
  )
}
