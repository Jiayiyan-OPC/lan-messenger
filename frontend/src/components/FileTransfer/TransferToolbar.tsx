import { Paperclip } from 'lucide-react'

interface TransferToolbarProps {
  onSendFile: () => void
  disabled: boolean
}

export function TransferToolbar({ onSendFile, disabled }: TransferToolbarProps) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold text-[#e0e0e0]">File Transfer</h3>
      <button
        type="button"
        onClick={onSendFile}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded-lg bg-[#533483] px-4 py-2 text-sm text-white transition-colors hover:bg-[#6c44a2] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Paperclip className="h-4 w-4" />
        Send File
      </button>
    </div>
  )
}
