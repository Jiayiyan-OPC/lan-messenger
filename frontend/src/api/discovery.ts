import { invoke } from '@tauri-apps/api/core'
import type { PeerInfo } from '../types'

export const discovery = {
  start: () => invoke<void>('start_discovery'),
  stop: () => invoke<void>('stop_discovery'),
  getPeers: () => invoke<PeerInfo[]>('get_discovered_peers'),
}
