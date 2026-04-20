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

  // macOS chrome strategy: `titleBarStyle: "Overlay"` + `hiddenTitle: true`
  // in tauri.conf.json gives us a native transparent titlebar with native
  // traffic-light buttons (close / minimize / maximize) at
  // `trafficLightPosition: [18, 18]`. The top ~28px of the window is a
  // native drag region automatically — we neither render custom dots nor
  // request `core:window:allow-start-dragging` anymore. The native chrome
  // also draws the window's rounded corners, so we drop the custom
  // rounded-card wrapper and just fill edge-to-edge.
  return (
    <div
      className="flex h-screen w-screen flex-col"
      style={{ background: 'var(--surface-raised)' }}
    >
      <TitleBar />
      <div className="relative flex min-h-0 flex-1">
        <Sidebar />
        <ChatView />
        <DetailPanel />
      </div>

      <ToastStack />
      <FileReceiveDialog />
    </div>
  )
}

function TitleBar() {
  return (
    <div
      className="flex shrink-0 items-center justify-center"
      style={{
        height: 36,
        background: 'var(--surface-sidebar)',
        borderBottom: '1px solid var(--border-soft)',
        // The native traffic lights are absolutely positioned at (18, 18) by
        // tauri.conf.json#trafficLightPosition. Pad the centered title away
        // from them so "LinkLan" doesn't collide with the close/min/max dots.
        paddingLeft: 78,
        paddingRight: 14,
      }}
    >
      <div
        className="text-[12px] font-semibold"
        style={{ color: 'var(--text-muted)' }}
      >
        LinkLan
      </div>
    </div>
  )
}
