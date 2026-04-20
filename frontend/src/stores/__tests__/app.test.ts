import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock Tauri APIs before importing stores
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

import { useAppStore } from '../app'

beforeEach(() => {
  useAppStore.setState({
    activeTab: 'chat',
    deviceId: null,
    deviceName: null,
  })
})

describe('useAppStore', () => {
  it('should have default state', () => {
    const state = useAppStore.getState()
    expect(state.activeTab).toBe('chat')
    expect(state.deviceId).toBeNull()
  })

  it('should set active tab', () => {
    useAppStore.getState().setActiveTab('files')
    expect(useAppStore.getState().activeTab).toBe('files')
  })

  it('should set device info', () => {
    useAppStore.getState().setDevice('dev-1', 'My PC')
    const state = useAppStore.getState()
    expect(state.deviceId).toBe('dev-1')
    expect(state.deviceName).toBe('My PC')
  })
})
