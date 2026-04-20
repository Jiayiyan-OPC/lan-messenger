import { useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
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
    // Outer div is transparent — the Tauri window has `transparent:true`, so
    // pixels outside the rounded card area show the desktop (no gray frame
    // like R3 left behind). Inner card keeps the 14px radius + drop shadow
    // that the design handoff calls for.
    <div
      className="relative flex h-screen w-screen flex-col"
      style={{ background: 'transparent' }}
    >
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        style={{
          borderRadius: 14,
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

async function runWindowCommand(op: 'close' | 'minimize' | 'toggleMaximize') {
  try {
    const win = getCurrentWindow()
    if (op === 'close') await win.close()
    else if (op === 'minimize') await win.minimize()
    else await win.toggleMaximize()
  } catch (err) {
    // Surface the real reason. In browser dev-preview `__TAURI_INTERNALS__`
    // is undefined and this will throw that; in the Tauri runtime it means
    // either permissions are missing or the API shape changed.
    // eslint-disable-next-line no-console
    console.error(`[titlebar:${op}]`, err)
  }
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
        // macOS belt-and-suspenders: Safari honors this natively and it's
        // what Tauri's drag injection eventually maps to.
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <div className="flex gap-[7px]">
        <TitleButton
          color="var(--warning-red)"
          glyph="×"
          ariaLabel="关闭"
          onClick={() => runWindowCommand('close')}
        />
        <TitleButton
          color="var(--warning-yellow)"
          glyph="−"
          ariaLabel="最小化"
          onClick={() => runWindowCommand('minimize')}
        />
        <TitleButton
          color="var(--success-green)"
          glyph="+"
          ariaLabel="最大化"
          onClick={() => runWindowCommand('toggleMaximize')}
        />
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

interface TitleButtonProps {
  color: string
  glyph: string
  ariaLabel: string
  onClick: () => void
}

function TitleButton({ color, glyph, ariaLabel, onClick }: TitleButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      // `data-tauri-drag-region="false"` opts the button out of the parent drag
      // region so clicks reach onClick instead of being consumed as a drag start.
      data-tauri-drag-region="false"
      className="group relative flex h-[12px] w-[12px] items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      style={{
        background: color,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      <span
        aria-hidden
        className="pointer-events-none text-[9px] font-black leading-none opacity-0 transition-opacity group-hover:opacity-80"
        style={{ color: 'rgba(0,0,0,0.65)' }}
      >
        {glyph}
      </span>
    </button>
  )
}
