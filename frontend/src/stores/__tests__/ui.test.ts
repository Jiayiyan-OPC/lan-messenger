import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from '../ui'

beforeEach(() => {
  // Reset state between tests; preserve store methods from the original create.
  useUiStore.setState({
    activeConvoId: null,
    sidebarTab: 'chats',
    detailOpen: true,
    dragOver: false,
    pinnedIds: new Set(),
    readAtByContact: {},
    toasts: [],
  })
  try {
    window.localStorage.clear()
  } catch {
    /* ignore */
  }
})

describe('useUiStore.markRead', () => {
  it('sets readAtByContact[peerId] to a fresh timestamp', () => {
    const before = Date.now()
    useUiStore.getState().markRead('peer-1')
    const stamp = useUiStore.getState().readAtByContact['peer-1']
    expect(stamp).toBeTypeOf('number')
    expect(stamp!).toBeGreaterThanOrEqual(before)
  })

  it('persists readAtByContact via ll-read-at', () => {
    useUiStore.getState().markRead('peer-2')
    const raw = window.localStorage.getItem('ll-read-at')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed['peer-2']).toBeTypeOf('number')
  })

  it('ignores empty peer ids', () => {
    useUiStore.getState().markRead('')
    expect(useUiStore.getState().readAtByContact).toEqual({})
  })

  it('keeps existing peer stamps when marking a different peer', () => {
    useUiStore.setState({ readAtByContact: { 'peer-a': 1 } })
    useUiStore.getState().markRead('peer-b')
    const map = useUiStore.getState().readAtByContact
    expect(map['peer-a']).toBe(1)
    expect(map['peer-b']).toBeGreaterThan(1)
  })
})
