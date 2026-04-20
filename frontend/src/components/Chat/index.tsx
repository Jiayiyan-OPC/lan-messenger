import { useCallback, useEffect, useMemo, useRef } from 'react'
import { MessageSquare } from 'lucide-react'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { useAppStore } from '../../stores/app'
import { useContactsStore } from '../../stores/contacts'
import { useMessagesStore, selectMessages } from '../../stores/messages'
import { useTransfersStore } from '../../stores/transfers'
import { useUiStore } from '../../stores/ui'
import { ChatHeader } from './ChatHeader'
import { MessageList } from './MessageList'
import { Composer } from './Composer'
import { DropOverlay } from '../Overlays/DropOverlay'

export function ChatView() {
  const activeConvoId = useUiStore((s) => s.activeConvoId)
  const contacts = useContactsStore((s) => s.contacts)
  const peer = useMemo(() => contacts.find((c) => c.id === activeConvoId) ?? null, [contacts, activeConvoId])

  const deviceId = useAppStore((s) => s.deviceId)
  const messages = useMessagesStore(selectMessages(activeConvoId))
  const loadMessages = useMessagesStore((s) => s.loadMessages)
  const sendMessage = useMessagesStore((s) => s.sendMessage)
  const sending = useMessagesStore((s) => s.sending)
  const sendFile = useTransfersStore((s) => s.sendFile)
  const initTransfers = useTransfersStore((s) => s.init)

  const dragOver = useUiStore((s) => s.dragOver)
  const setDragOver = useUiStore((s) => s.setDragOver)
  const pushToast = useUiStore((s) => s.pushToast)

  // Track the chat region so drag-drop only fires when the cursor is inside it.
  const regionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    initTransfers()
  }, [initTransfers])

  useEffect(() => {
    if (activeConvoId) loadMessages(activeConvoId)
  }, [activeConvoId, loadMessages])

  // Tauri-native drag-drop. Fallback to HTML5 on non-Tauri envs (vite preview).
  useEffect(() => {
    let unlisten: UnlistenFn | null = null
    let alive = true

    const setup = async () => {
      try {
        const wv = getCurrentWebview()
        unlisten = await wv.onDragDropEvent((event) => {
          if (!alive) return
          const payload = event.payload
          if (payload.type === 'enter' || payload.type === 'over') {
            const rect = regionRef.current?.getBoundingClientRect()
            if (!rect) return
            // DPR scaling — payload.position is in physical pixels.
            const dpr = window.devicePixelRatio || 1
            const x = payload.position.x / dpr
            const y = payload.position.y / dpr
            const inside =
              x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
            setDragOver(inside)
          } else if (payload.type === 'leave') {
            setDragOver(false)
          } else if (payload.type === 'drop') {
            setDragOver(false)
            if (!activeConvoId) {
              pushToast({ kind: 'info', title: '请先选择一个对话' })
              return
            }
            for (const p of payload.paths) {
              void sendFile(activeConvoId, p).catch((err) => {
                pushToast({
                  kind: 'info',
                  title: '发送失败',
                  body: String(err),
                })
              })
              pushToast({
                kind: 'file',
                title: '文件发送中',
                body: p.split('/').pop() ?? p,
              })
            }
          }
        })
      } catch {
        // Non-Tauri env — HTML5 fallback will take over (see handlers below).
      }
    }
    void setup()

    return () => {
      alive = false
      if (unlisten) unlisten()
    }
  }, [activeConvoId, sendFile, setDragOver, pushToast])

  const handleSend = useCallback(
    (content: string) => {
      if (!activeConvoId) return
      sendMessage(activeConvoId, content).catch((err) =>
        pushToast({ kind: 'info', title: '发送失败', body: String(err) }),
      )
    },
    [activeConvoId, sendMessage, pushToast],
  )

  const handleAttach = useCallback(() => {
    pushToast({
      kind: 'info',
      title: '附件按钮',
      body: '请将文件拖拽到此处以发送',
    })
  }, [pushToast])

  // HTML5 drag fallback for dev preview — we only prevent default to keep
  // the browser from navigating away. Actual paths require the Tauri bridge.
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault()
      setDragOver(true)
    }
  }, [setDragOver])
  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDragOver(false)
  }, [setDragOver])
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    // File.path isn't available in browsers; Tauri handler above picks up
    // the real paths. This only suppresses the default browser action.
  }, [setDragOver])

  if (!peer) {
    return (
      <main
        className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-muted)]"
        style={{ background: 'var(--surface-window)' }}
      >
        <MessageSquare size={42} strokeWidth={1.5} className="opacity-40" />
        <p className="text-[14px]">从左侧选择一位设备开始对话</p>
      </main>
    )
  }

  return (
    <main
      ref={regionRef}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative flex min-w-0 flex-1 flex-col"
      style={{ background: 'var(--surface-window)' }}
    >
      <ChatHeader contact={peer} />
      <MessageList messages={messages} deviceId={deviceId} peer={peer} />
      <Composer onSend={handleSend} onAttach={handleAttach} disabled={sending} />
      <DropOverlay show={dragOver} peerName={peer.name} />
    </main>
  )
}
