import { Upload } from 'lucide-react'

interface DropOverlayProps {
  show: boolean
  peerName?: string
}

export function DropOverlay({ show, peerName }: DropOverlayProps) {
  if (!show) return null
  return (
    <div
      className="pointer-events-none absolute inset-0 p-4 animate-fade-in"
      style={{ zIndex: 50 }}
    >
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-[24px]"
        style={{
          border: '3px dashed var(--accent)',
          background: 'rgba(111,181,208,0.08)',
          backdropFilter: 'blur(2px)',
        }}
      >
        <div
          className="flex h-[80px] w-[80px] items-center justify-center text-white"
          style={{
            borderRadius: 24,
            background: 'linear-gradient(135deg, var(--accent-light), var(--accent))',
            boxShadow: '0 10px 28px rgba(58,125,153,0.35)',
          }}
        >
          <Upload size={38} strokeWidth={1.8} />
        </div>
        <div className="text-[18px] font-bold text-[var(--text-primary)]">
          松开以发送{peerName ? `到 ${peerName}` : ''}
        </div>
        <div className="text-[13px] text-[var(--text-muted)]">
          文件将通过 LAN 直连，无需中转服务器
        </div>
      </div>
    </div>
  )
}
