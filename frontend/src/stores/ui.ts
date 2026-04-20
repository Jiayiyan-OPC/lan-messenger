import { create } from 'zustand'
import type { SidebarTab, Toast, ToastKind } from '../types'

const LS_ACTIVE = 'll-active'
const LS_DETAIL = 'll-detail-open'
const LS_PINNED = 'll-pinned'

function readLocal(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocal(key: string, value: string) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value)
  } catch {
    /* ignore quota/private-mode errors */
  }
}

function loadPinned(): Set<string> {
  const raw = readLocal(LS_PINNED)
  if (!raw) return new Set()
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function loadDetailOpen(): boolean {
  const raw = readLocal(LS_DETAIL)
  if (raw === null) return true
  return raw === '1' || raw === 'true'
}

interface UiState {
  /** Active conversation / peer id (contact id). Persists via `ll-active`. */
  activeConvoId: string | null
  /** Sidebar tab: chats or devices. */
  sidebarTab: SidebarTab
  /** Detail panel open flag. Persists via `ll-detail-open`. */
  detailOpen: boolean
  /** Dragging a file over the chat region. */
  dragOver: boolean
  /** Pinned conversation ids (persists via `ll-pinned`). */
  pinnedIds: Set<string>
  /** Live toasts bottom-right. */
  toasts: Toast[]

  setActiveConvo: (id: string | null) => void
  setSidebarTab: (tab: SidebarTab) => void
  toggleDetail: () => void
  setDetailOpen: (open: boolean) => void
  setDragOver: (over: boolean) => void
  togglePinned: (id: string) => void
  isPinned: (id: string) => boolean
  pushToast: (t: Omit<Toast, 'id'> & { id?: string }) => string
  removeToast: (id: string) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  activeConvoId: readLocal(LS_ACTIVE),
  sidebarTab: 'chats',
  detailOpen: loadDetailOpen(),
  dragOver: false,
  pinnedIds: loadPinned(),
  toasts: [],

  setActiveConvo: (id) => {
    if (id) writeLocal(LS_ACTIVE, id)
    else writeLocal(LS_ACTIVE, '')
    set({ activeConvoId: id })
  },
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  toggleDetail: () => {
    const next = !get().detailOpen
    writeLocal(LS_DETAIL, next ? '1' : '0')
    set({ detailOpen: next })
  },
  setDetailOpen: (open) => {
    writeLocal(LS_DETAIL, open ? '1' : '0')
    set({ detailOpen: open })
  },
  setDragOver: (over) => set({ dragOver: over }),
  togglePinned: (id) => {
    const next = new Set(get().pinnedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    writeLocal(LS_PINNED, JSON.stringify([...next]))
    set({ pinnedIds: next })
  },
  isPinned: (id) => get().pinnedIds.has(id),
  pushToast: (t) => {
    const id = t.id ?? `tst-${Math.random().toString(36).slice(2, 8)}`
    const toast: Toast = {
      id,
      kind: t.kind,
      title: t.title,
      body: t.body,
      durationMs: t.durationMs ?? 3800,
    }
    set((s) => ({ toasts: [...s.toasts, toast] }))
    if (toast.durationMs && toast.durationMs > 0) {
      setTimeout(() => {
        // remove via store method so consumers see the update
        const cur = useUiStore.getState().toasts
        if (cur.some((x) => x.id === id)) {
          useUiStore.setState({ toasts: cur.filter((x) => x.id !== id) })
        }
      }, toast.durationMs)
    }
    return id
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export type { ToastKind }
