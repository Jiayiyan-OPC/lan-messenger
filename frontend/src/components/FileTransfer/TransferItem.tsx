import { cn } from '../../lib/cn'
import { formatSize } from '../../lib/format'
import { ProgressBar } from '../ui/ProgressBar'
import { X, CheckCircle2, XCircle, Clock, Upload } from 'lucide-react'
import type { FileTransfer } from '../../types'

interface TransferItemProps {
  transfer: FileTransfer
  peerName?: string
  onCancel?: () => void
}

const statusConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  pending: { icon: <Clock className="h-5 w-5" />, color: 'text-[#f0ad4e]' },
  accepted: { icon: <Clock className="h-5 w-5" />, color: 'text-[#4ecca3]' },
  in_progress: { icon: <Upload className="h-5 w-5" />, color: 'text-[#4ecca3]' },
  completed: { icon: <CheckCircle2 className="h-5 w-5" />, color: 'text-[#4ecca3]' },
  failed: { icon: <XCircle className="h-5 w-5" />, color: 'text-[#e74c3c]' },
  rejected: { icon: <XCircle className="h-5 w-5" />, color: 'text-[#e74c3c]' },
}

export function TransferItem({ transfer, peerName, onCancel }: TransferItemProps) {
  const config = statusConfig[transfer.status] ?? statusConfig.pending!
  const progress = transfer.file_size > 0 ? transfer.bytes_transferred / transfer.file_size : 0
  const isActive = transfer.status === 'in_progress' || transfer.status === 'pending' || transfer.status === 'accepted'

  return (
    <div className={cn('flex items-center gap-3 rounded-lg bg-[#1a1a2e] p-3', isActive && 'border-l-[3px] border-[#4ecca3]')}>
      <div className={cn('shrink-0', config!.color)}>{config!.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[#e0e0e0]">{transfer.file_name}</div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-[#666]">
          {peerName && <span>{peerName}</span>}
          <span>{formatSize(transfer.file_size)}</span>
          {!isActive && <span className="capitalize">{transfer.status}</span>}
        </div>
        {isActive && (
          <>
            <ProgressBar value={progress} className="mt-1.5" />
            <div className="mt-0.5 text-[11px] text-[#4ecca3]">
              {(progress * 100).toFixed(1)}% — {formatSize(transfer.bytes_transferred)} transferred
            </div>
          </>
        )}
      </div>
      {isActive && onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 rounded p-1 text-[#e74c3c] hover:bg-[#e74c3c]/10"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
