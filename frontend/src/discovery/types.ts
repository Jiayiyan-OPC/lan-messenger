/**
 * Discovery Service - Types and Interfaces
 *
 * UDP broadcast-based device discovery for LAN.
 * Heartbeat: every 30s. Timeout: 90s without heartbeat = offline.
 */

/** Discovered peer device */
export interface Peer {
  /** Device UUID */
  id: string
  /** Display name */
  name: string
  /** IP address */
  ipAddress: string
  /** Service port */
  port: number
  /** Last heartbeat received (Unix ms) */
  lastSeen: number
}

/** Discovery events */
export enum DiscoveryEvent {
  /** New peer discovered */
  PeerFound = 'peer-found',
  /** Peer went offline (timeout or explicit) */
  PeerLost = 'peer-lost',
  /** Peer info updated (name, port change) */
  PeerUpdated = 'peer-updated',
}

export type DiscoveryEventHandler = (event: DiscoveryEvent, peer: Peer) => void

/** Discovery service configuration */
export interface DiscoveryConfig {
  /** Broadcast port (default: 19876) */
  broadcastPort: number
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval: number
  /** Timeout threshold in ms (default: 90000) */
  timeoutThreshold: number
  /** This device's ID */
  deviceId: string
  /** This device's display name */
  deviceName: string
  /** This device's service port */
  servicePort: number
}

export const DEFAULT_CONFIG: Omit<DiscoveryConfig, 'deviceId' | 'deviceName' | 'servicePort'> = {
  broadcastPort: 19876,
  heartbeatInterval: 30_000,
  timeoutThreshold: 90_000,
}

/** Discovery service interface */
export interface DiscoveryService {
  /** Start broadcasting and listening */
  start(): void
  /** Stop the service and broadcast offline */
  stop(): void
  /** Get currently known peers */
  getPeers(): Peer[]
  /** Register event handler */
  on(handler: DiscoveryEventHandler): void
  /** Remove event handler */
  off(handler: DiscoveryEventHandler): void
  /** Whether service is running */
  readonly isRunning: boolean
}
