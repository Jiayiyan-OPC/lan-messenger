import { useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/Chat'
import { DetailPanel } from './components/Detail'
import { ToastStack } from './components/Overlays/ToastStack'
import { FileReceiveDialog } from './components/Dialogs/FileReceiveDialog'
import { useDeviceInfo } from './hooks/useDeviceInfo'
import { useUiStore } from './stores/ui'

export function App() {
  // Kick off device-info fetch once at the top level so every sub-tree sees
  // deviceId on first paint without waterfalling multiple invokes.
  useDeviceInfo()

  // Escape clears a lingering drop-overlay state (in case of stuck events).
  const setDragOver = useUiStore((s) => s.setDragOver)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDragOver(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setDragOver])

  return (
    <div
      className="flex h-screen w-screen flex-col"
      style={{ background: 'var(--surface-app-bg)', padding: 24 }}
    >
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        style={{
          minWidth: 1232,
          minHeight: 712,
          borderRadius: 26,
          background: 'var(--surface-raised)',
          boxShadow: 'var(--shadow-window)',
          border: '1px solid var(--border-soft)',
        }}
      >
        <TitleBar />
        <div className="relative flex min-h-0 flex-1">
          <Sidebar />
          <ChatView />
          <DetailPanel />
        </div>
      </div>

      <ToastStack />
      <FileReceiveDialog />
    </div>
  )
}

function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      className="flex shrink-0 items-center gap-2 px-3"
      style={{
        height: 36,
        background: 'var(--surface-sidebar)',
        borderBottom: '1px solid var(--border-soft)',
      }}
    >
      <div className="flex gap-[7px]">
        <TitleLight color="var(--warning-red)" />
        <TitleLight color="var(--warning-yellow)" />
        <TitleLight color="var(--success-green)" />
      </div>
      <div
        className="flex-1 text-center text-[12px] font-semibold"
        style={{ color: 'var(--text-muted)' }}
      >
        LinkLan
      </div>
      <div className="w-[50px]" />
    </div>
  )
}

function TitleLight({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-[12px] w-[12px] rounded-full"
      style={{
        background: color,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
      }}
    />
  )
}
