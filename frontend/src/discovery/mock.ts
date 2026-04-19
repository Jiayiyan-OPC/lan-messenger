/**
 * Discovery Service - In-Memory Implementation
 *
 * Simulates UDP discovery for unit testing.
 * Production uses Tauri backend (Rust UDP sockets).
 */

import type { Peer, DiscoveryConfig, DiscoveryService, DiscoveryEventHandler } from './types'
import { DiscoveryEvent, DEFAULT_CONFIG } from './types'

export class MockDiscoveryService implements DiscoveryService {
  private peers = new Map<string, Peer>()
  private handlers: DiscoveryEventHandler[] = []
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private timeoutTimer: ReturnType<typeof setInterval> | null = null
  private config: DiscoveryConfig
  private running = false

  constructor(config: Partial<DiscoveryConfig> & Pick<DiscoveryConfig, 'deviceId' | 'deviceName' | 'servicePort'>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  get isRunning(): boolean {
    return this.running
  }

  start(): void {
    if (this.running) return
    this.running = true

    // Start timeout checker
    this.timeoutTimer = setInterval(() => {
      this.checkTimeouts()
    }, this.config.heartbeatInterval)
  }

  stop(): void {
    if (!this.running) return
    this.running = false

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.timeoutTimer) {
      clearInterval(this.timeoutTimer)
      this.timeoutTimer = null
    }
  }

  getPeers(): Peer[] {
    return Array.from(this.peers.values())
  }

  on(handler: DiscoveryEventHandler): void {
    this.handlers.push(handler)
  }

  off(handler: DiscoveryEventHandler): void {
    const idx = this.handlers.indexOf(handler)
    if (idx !== -1) this.handlers.splice(idx, 1)
  }

  // --- Test helpers ---

  /** Simulate receiving a ping from a peer */
  simulatePeerPing(peer: Omit<Peer, 'lastSeen'>): void {
    const now = Date.now()
    const existing = this.peers.get(peer.id)
    const fullPeer: Peer = { ...peer, lastSeen: now }

    if (!existing) {
      this.peers.set(peer.id, fullPeer)
      this.emit(DiscoveryEvent.PeerFound, fullPeer)
    } else {
      const updated = existing.name !== peer.name || existing.port !== peer.port
      this.peers.set(peer.id, fullPeer)
      if (updated) {
        this.emit(DiscoveryEvent.PeerUpdated, fullPeer)
      }
    }
  }

  /** Simulate a peer going offline explicitly */
  simulatePeerOffline(peerId: string): void {
    const peer = this.peers.get(peerId)
    if (peer) {
      this.peers.delete(peerId)
      this.emit(DiscoveryEvent.PeerLost, peer)
    }
  }

  /** Simulate time passing to trigger timeouts */
  simulateTimeout(peerId: string): void {
    const peer = this.peers.get(peerId)
    if (peer) {
      // Set lastSeen to beyond threshold
      peer.lastSeen = Date.now() - this.config.timeoutThreshold - 1
      this.checkTimeouts()
    }
  }

  private checkTimeouts(): void {
    const now = Date.now()
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > this.config.timeoutThreshold) {
        this.peers.delete(id)
        this.emit(DiscoveryEvent.PeerLost, peer)
      }
    }
  }

  private emit(event: DiscoveryEvent, peer: Peer): void {
    for (const handler of this.handlers) {
      handler(event, peer)
    }
  }
}
