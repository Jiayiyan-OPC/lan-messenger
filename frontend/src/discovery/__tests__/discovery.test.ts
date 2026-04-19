import { describe, it, expect, beforeEach } from 'vitest'
import { MockDiscoveryService, DiscoveryEvent } from '../index'
import type { Peer, DiscoveryEventHandler } from '../index'

let service: MockDiscoveryService
let events: Array<{ event: string; peer: Peer }>
let handler: DiscoveryEventHandler

beforeEach(() => {
  service = new MockDiscoveryService({
    deviceId: 'my-device',
    deviceName: 'My PC',
    servicePort: 9876,
    timeoutThreshold: 90_000,
  })
  events = []
  handler = (event, peer) => events.push({ event, peer })
  service.on(handler)
  service.start()
})

describe('DiscoveryService', () => {
  it('should start and stop', () => {
    expect(service.isRunning).toBe(true)
    service.stop()
    expect(service.isRunning).toBe(false)
  })

  it('should discover new peer', () => {
    service.simulatePeerPing({
      id: 'peer-1',
      name: 'Peer One',
      ipAddress: '192.168.1.101',
      port: 9876,
    })
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe(DiscoveryEvent.PeerFound)
    expect(events[0].peer.id).toBe('peer-1')
    expect(service.getPeers()).toHaveLength(1)
  })

  it('should not re-emit PeerFound on heartbeat', () => {
    const peer = { id: 'peer-1', name: 'Peer', ipAddress: '192.168.1.101', port: 9876 }
    service.simulatePeerPing(peer)
    service.simulatePeerPing(peer) // heartbeat
    expect(events).toHaveLength(1) // only one PeerFound
  })

  it('should emit PeerUpdated when name changes', () => {
    service.simulatePeerPing({ id: 'peer-1', name: 'Old Name', ipAddress: '192.168.1.101', port: 9876 })
    service.simulatePeerPing({ id: 'peer-1', name: 'New Name', ipAddress: '192.168.1.101', port: 9876 })
    expect(events).toHaveLength(2)
    expect(events[1].event).toBe(DiscoveryEvent.PeerUpdated)
    expect(events[1].peer.name).toBe('New Name')
  })

  it('should emit PeerLost on explicit offline', () => {
    service.simulatePeerPing({ id: 'peer-1', name: 'Peer', ipAddress: '192.168.1.101', port: 9876 })
    service.simulatePeerOffline('peer-1')
    expect(events).toHaveLength(2)
    expect(events[1].event).toBe(DiscoveryEvent.PeerLost)
    expect(service.getPeers()).toHaveLength(0)
  })

  it('should emit PeerLost on timeout', () => {
    service.simulatePeerPing({ id: 'peer-1', name: 'Peer', ipAddress: '192.168.1.101', port: 9876 })
    service.simulateTimeout('peer-1')
    expect(events).toHaveLength(2)
    expect(events[1].event).toBe(DiscoveryEvent.PeerLost)
    expect(service.getPeers()).toHaveLength(0)
  })

  it('should track multiple peers', () => {
    service.simulatePeerPing({ id: 'peer-1', name: 'Peer 1', ipAddress: '192.168.1.101', port: 9876 })
    service.simulatePeerPing({ id: 'peer-2', name: 'Peer 2', ipAddress: '192.168.1.102', port: 9876 })
    expect(service.getPeers()).toHaveLength(2)
  })

  it('should remove handler with off()', () => {
    service.off(handler)
    service.simulatePeerPing({ id: 'peer-1', name: 'Peer', ipAddress: '192.168.1.101', port: 9876 })
    expect(events).toHaveLength(0)
  })

  it('should update lastSeen on heartbeat', async () => {
    service.simulatePeerPing({ id: 'peer-1', name: 'Peer', ipAddress: '192.168.1.101', port: 9876 })
    const firstSeen = service.getPeers()[0].lastSeen
    // Wait a tiny bit for Date.now() to advance
    await new Promise((r) => setTimeout(r, 5))
    service.simulatePeerPing({ id: 'peer-1', name: 'Peer', ipAddress: '192.168.1.101', port: 9876 })
    const secondSeen = service.getPeers()[0].lastSeen
    expect(secondSeen).toBeGreaterThanOrEqual(firstSeen)
  })
})
