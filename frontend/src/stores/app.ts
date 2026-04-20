import { create } from 'zustand'
import type { ActiveTab, DeviceInfo } from '../types'

interface AppState {
  activeTab: ActiveTab
  deviceId: string | null
  deviceName: string | null
  /** Full device info (hostname, ip, os). Populated once at App mount by
   *  `useDeviceInfo` — consumers read from here instead of re-invoking. */
  deviceInfo: DeviceInfo | null

  setActiveTab: (tab: ActiveTab) => void
  setDevice: (id: string, name: string) => void
  setDeviceInfo: (info: DeviceInfo) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'chat',
  deviceId: null,
  deviceName: null,
  deviceInfo: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setDevice: (id, name) => set({ deviceId: id, deviceName: name }),
  setDeviceInfo: (info) =>
    set({ deviceInfo: info, deviceId: info.id, deviceName: info.name }),
}))
