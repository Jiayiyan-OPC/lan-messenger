import { invoke } from '@tauri-apps/api/core'
import type { DeviceInfo } from '../types'

export const device = {
  getInfo: () => invoke<DeviceInfo>('get_device_info'),
}
