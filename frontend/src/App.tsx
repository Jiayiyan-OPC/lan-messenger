import { useAppStore } from './stores/app'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/Chat'
import { FileTransferView } from './components/FileTransfer'
import { FileReceiveDialog } from './components/Dialogs/FileReceiveDialog'
import { MessageSquare, FolderOpen } from 'lucide-react'
import { cn } from './lib/cn'

export function App() {
  const activeTab = useAppStore((s) => s.activeTab)
  const setActiveTab = useAppStore((s) => s.setActiveTab)

  return (
    <div className="flex h-screen bg-[#0a0a1a] text-[#e2e8f0]">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Tab bar */}
        <div className="flex h-14 items-center border-b border-[#16213e] bg-[#1a1a2e]">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-5 py-2.5 text-sm transition-colors',
              activeTab === 'chat'
                ? 'border-[#533483] text-[#e0e0e0]'
                : 'border-transparent text-[#888] hover:text-[#ccc]',
            )}
          >
            <MessageSquare className="h-4 w-4" /> Chat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-5 py-2.5 text-sm transition-colors',
              activeTab === 'files'
                ? 'border-[#533483] text-[#e0e0e0]'
                : 'border-transparent text-[#888] hover:text-[#ccc]',
            )}
          >
            <FolderOpen className="h-4 w-4" /> Files
          </button>
        </div>

        {/* Tab content */}
        <div className="flex min-h-0 flex-1 flex-col bg-[#16213e]">
          {activeTab === 'chat' ? <ChatView /> : <FileTransferView />}
        </div>
      </main>

      <FileReceiveDialog />
    </div>
  )
}
