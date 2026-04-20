import { create } from 'zustand'
import type { ActiveTab } from '../types'

interface AppState {
  activeTab: ActiveTab
  deviceId: string | null
  deviceName: string | null

  setActiveTab: (tab: ActiveTab) => void
  setDevice: (id: string, name: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'chat',
  deviceId: null,
  deviceName: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setDevice: (id, name) => set({ deviceId: id, deviceName: name }),
}))
