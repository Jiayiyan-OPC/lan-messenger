import { useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/Chat'
import { DetailPanel } from './components/Detail'
import { ToastStack } from './components/Overlays/ToastStack'
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

  // Chrome strategy: use the OS's native titlebar. On macOS that gives us
  // real traffic-light buttons and 100%-reliable dragging; on Linux/Windows
  // the native frame draws its own chrome. No more custom drag regions,
  // no more transparent-window hacks, no more window-permission wiring.
  // Trade-off: we lose the custom "LinkLan" centered title strip — but
  // the native titlebar already shows "LinkLan" from tauri.conf.json#title.
  return (
    <div
      className="flex h-screen w-screen flex-col"
      style={{ background: 'var(--surface-raised)' }}
    >
      <div className="relative flex min-h-0 flex-1">
        <Sidebar />
        <ChatView />
        <DetailPanel />
      </div>

      <ToastStack />
    </div>
  )
}
