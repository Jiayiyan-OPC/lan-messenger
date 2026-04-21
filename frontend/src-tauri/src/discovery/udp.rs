use std::collections::HashMap;
use std::net::{SocketAddr, UdpSocket, Ipv4Addr, IpAddr};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

const BROADCAST_ADDR: Ipv4Addr = Ipv4Addr::new(255, 255, 255, 255);
const MAGIC: &[u8; 4] = b"LMSG";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfo {
    pub id: String,
    pub name: String,
    pub port: u16,
}

#[derive(Debug, Clone)]
pub struct DiscoveredPeer {
    pub info: PeerInfo,
    pub addr: SocketAddr,
    pub last_seen: Instant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum DiscoveryPacket {
    Ping(PeerInfo),
    Pong(PeerInfo),
    Offline(String), // device_id
}

pub enum DiscoveryEvent {
    PeerFound(DiscoveredPeer),
    PeerLost(String), // device_id
    PeerUpdated(DiscoveredPeer),
}

pub struct DiscoveryConfig {
    pub broadcast_port: u16,
    pub heartbeat_interval: Duration,
    pub timeout_threshold: Duration,
    pub device_id: String,
    pub device_name: String,
    pub service_port: u16,
}

impl Default for DiscoveryConfig {
    fn default() -> Self {
        Self {
            broadcast_port: 19876,
            heartbeat_interval: Duration::from_secs(30),
            timeout_threshold: Duration::from_secs(90),
            device_id: String::new(),
            device_name: String::new(),
            service_port: 0,
        }
    }
}

pub struct DiscoveryService {
    config: DiscoveryConfig,
    peers: Arc<Mutex<HashMap<String, DiscoveredPeer>>>,
    running: Arc<Mutex<bool>>,
    event_tx: Option<std::sync::mpsc::Sender<DiscoveryEvent>>,
}

impl DiscoveryService {
    pub fn new(
        config: DiscoveryConfig,
        event_tx: std::sync::mpsc::Sender<DiscoveryEvent>,
    ) -> Self {
        Self {
            config,
            peers: Arc::new(Mutex::new(HashMap::new())),
            running: Arc::new(Mutex::new(false)),
            event_tx: Some(event_tx),
        }
    }

    pub fn start(&self) -> std::io::Result<()> {
        {
            let mut running = self.running.lock().unwrap();
            if *running {
                return Ok(());
            }
            *running = true;
        }

        // Bind with SO_REUSEADDR for macOS compatibility
        let socket = bind_reusable(self.config.broadcast_port)?;
        socket.set_broadcast(true)?;
        socket.set_read_timeout(Some(Duration::from_secs(1)))?;

        let recv_socket = socket.try_clone()?;
        // Separate socket for sending (avoids send/recv contention on macOS)
        let send_socket = UdpSocket::bind("0.0.0.0:0")?;
        send_socket.set_broadcast(true)?;

        // Heartbeat sender thread
        let running = Arc::clone(&self.running);
        let broadcast_port = self.config.broadcast_port;
        let heartbeat_interval = self.config.heartbeat_interval;
        let my_info = PeerInfo {
            id: self.config.device_id.clone(),
            name: self.config.device_name.clone(),
            port: self.config.service_port,
        };

        let send_info = my_info.clone();
        thread::spawn(move || {
            let packet = DiscoveryPacket::Ping(send_info);
            let data = rmp_serde::to_vec(&packet).unwrap();
            let mut frame = Vec::with_capacity(MAGIC.len() + data.len());
            frame.extend_from_slice(MAGIC);
            frame.extend_from_slice(&data);

            let broadcast_addr = SocketAddr::new(BROADCAST_ADDR.into(), broadcast_port);

            while *running.lock().unwrap() {
                // Send to 255.255.255.255 (works on Linux)
                let _ = send_socket.send_to(&frame, broadcast_addr);

                // Also send to subnet broadcast addresses (required for macOS)
                for subnet_broadcast in get_subnet_broadcasts() {
                    let addr = SocketAddr::new(subnet_broadcast.into(), broadcast_port);
                    if addr != broadcast_addr {
                        let _ = send_socket.send_to(&frame, addr);
                    }
                }

                thread::sleep(heartbeat_interval);
            }

            // Send offline notification
            let offline_packet = DiscoveryPacket::Offline(packet_id(&packet));
            if let Ok(data) = rmp_serde::to_vec(&offline_packet) {
                let mut frame = Vec::with_capacity(MAGIC.len() + data.len());
                frame.extend_from_slice(MAGIC);
                frame.extend_from_slice(&data);
                let _ = send_socket.send_to(&frame, broadcast_addr);
            }
        });

        // Receiver thread
        let peers = Arc::clone(&self.peers);
        let running = Arc::clone(&self.running);
        let timeout = self.config.timeout_threshold;
        let my_id = self.config.device_id.clone();
        let my_info_for_pong = my_info.clone();
        let event_tx = self.event_tx.clone();
        let pong_port = self.config.broadcast_port;

        thread::spawn(move || {
            // Separate socket for sending Pong replies
            let pong_socket = UdpSocket::bind("0.0.0.0:0").ok();
            if let Some(ref s) = pong_socket {
                let _ = s.set_broadcast(true);
            }

            let mut buf = [0u8; 65535];
            while *running.lock().unwrap() {
                // Check timeouts
                {
                    let mut peers = peers.lock().unwrap();
                    let now = Instant::now();
                    let timed_out: Vec<String> = peers
                        .iter()
                        .filter(|(_, p)| now.duration_since(p.last_seen) > timeout)
                        .map(|(id, _)| id.clone())
                        .collect();
                    for id in timed_out {
                        peers.remove(&id);
                        if let Some(tx) = &event_tx {
                            let _ = tx.send(DiscoveryEvent::PeerLost(id));
                        }
                    }
                }

                match recv_socket.recv_from(&mut buf) {
                    Ok((n, addr)) => {
                        if n < MAGIC.len() || &buf[..4] != MAGIC {
                            continue;
                        }
                        let data = &buf[MAGIC.len()..n];
                        let packet: DiscoveryPacket = match rmp_serde::from_slice(data) {
                            Ok(p) => p,
                            Err(_) => continue,
                        };

                        match packet {
                            DiscoveryPacket::Ping(ref info) => {
                                if info.id == my_id {
                                    continue;
                                }

                                // Reply with Pong so the sender knows about us
                                if let Some(ref sock) = pong_socket {
                                    let pong = DiscoveryPacket::Pong(my_info_for_pong.clone());
                                    if let Ok(pong_data) = rmp_serde::to_vec(&pong) {
                                        let mut pong_frame = Vec::with_capacity(MAGIC.len() + pong_data.len());
                                        pong_frame.extend_from_slice(MAGIC);
                                        pong_frame.extend_from_slice(&pong_data);
                                        // Send Pong directly to the peer's address
                                        let reply_addr = SocketAddr::new(addr.ip(), pong_port);
                                        let _ = sock.send_to(&pong_frame, reply_addr);
                                    }
                                }

                                // Register peer
                                register_peer(&peers, &event_tx, info.clone(), addr);
                            }
                            DiscoveryPacket::Pong(ref info) => {
                                if info.id == my_id {
                                    continue;
                                }
                                register_peer(&peers, &event_tx, info.clone(), addr);
                            }
                            DiscoveryPacket::Offline(id) => {
                                let mut peers = peers.lock().unwrap();
                                if peers.remove(&id).is_some() {
                                    if let Some(tx) = &event_tx {
                                        let _ = tx.send(DiscoveryEvent::PeerLost(id));
                                    }
                                }
                            }
                        }
                    }
                    Err(_) => continue, // timeout, just loop
                }
            }
        });

        Ok(())
    }

    pub fn stop(&self) {
        let mut running = self.running.lock().unwrap();
        *running = false;
        drop(running);
        // Fire an Offline packet synchronously here rather than waiting for
        // the heartbeat thread to wake up from its (up to 30s) sleep. On app
        // quit we only have a narrow window before the process exits, so
        // piggy-backing on the thread's loop would miss the broadcast ~half
        // the time.
        self.broadcast_offline_once();
    }

    /// One-shot Offline broadcast — used by `stop()` and by the Tauri
    /// `ExitRequested` hook so peers see us go away immediately instead of
    /// waiting out the 90s heartbeat timeout.
    pub fn broadcast_offline_once(&self) {
        let packet = DiscoveryPacket::Offline(self.config.device_id.clone());
        let Ok(data) = rmp_serde::to_vec(&packet) else { return };
        let mut frame = Vec::with_capacity(MAGIC.len() + data.len());
        frame.extend_from_slice(MAGIC);
        frame.extend_from_slice(&data);

        let Ok(sock) = UdpSocket::bind("0.0.0.0:0") else { return };
        let _ = sock.set_broadcast(true);

        let broadcast_addr =
            SocketAddr::new(BROADCAST_ADDR.into(), self.config.broadcast_port);
        let _ = sock.send_to(&frame, broadcast_addr);

        for subnet_broadcast in get_subnet_broadcasts() {
            let addr = SocketAddr::new(subnet_broadcast.into(), self.config.broadcast_port);
            if addr != broadcast_addr {
                let _ = sock.send_to(&frame, addr);
            }
        }
    }

    pub fn get_peers(&self) -> Vec<DiscoveredPeer> {
        self.peers.lock().unwrap().values().cloned().collect()
    }
}

/// Register or update a peer in the peers map and emit events.
fn register_peer(
    peers: &Arc<Mutex<HashMap<String, DiscoveredPeer>>>,
    event_tx: &Option<std::sync::mpsc::Sender<DiscoveryEvent>>,
    info: PeerInfo,
    addr: SocketAddr,
) {
    let mut peers = peers.lock().unwrap();
    let is_new = !peers.contains_key(&info.id);
    let peer = DiscoveredPeer {
        info: info.clone(),
        addr,
        last_seen: Instant::now(),
    };
    peers.insert(info.id.clone(), peer.clone());

    if let Some(tx) = event_tx {
        if is_new {
            let _ = tx.send(DiscoveryEvent::PeerFound(peer));
        } else {
            let _ = tx.send(DiscoveryEvent::PeerUpdated(peer));
        }
    }
}

/// Bind a UDP socket with SO_REUSEADDR (required on macOS for multiple
/// processes/broadcast receive on the same port).
fn bind_reusable(port: u16) -> std::io::Result<UdpSocket> {
    use std::net::SocketAddrV4;

    #[cfg(unix)]
    {
        use std::os::unix::io::AsRawFd;
        let socket = socket2::Socket::new(
            socket2::Domain::IPV4,
            socket2::Type::DGRAM,
            Some(socket2::Protocol::UDP),
        )?;
        socket.set_reuse_address(true)?;
        #[cfg(target_os = "macos")]
        socket.set_reuse_port(true)?;
        socket.bind(&SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, port).into())?;
        Ok(socket.into())
    }

    #[cfg(not(unix))]
    {
        UdpSocket::bind(SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, port))
    }
}

/// Get subnet broadcast addresses for all non-loopback, non-tunnel
/// IPv4 interfaces.
///
/// Heartbeats are sent to each subnet broadcast so peers on a LAN that
/// blocks the limited 255.255.255.255 broadcast (macOS, some Wi-Fi APs)
/// still receive Pings. **Tunnel / VPN interfaces are excluded** — the
/// same `is_tunnel_interface` filter `commands.rs::best_effort_local_ip`
/// uses for IP display. Without this filter, a heartbeat broadcast goes
/// out the VPN tunnel; two laptops on the same corporate VPN but different
/// physical LANs would erroneously discover each other as "peers". See
/// the network-adversary review (Scenario E) for the failure mode.
///
/// Backed by `if_addrs::get_if_addrs()` rather than shelling out to
/// `ifconfig` / `ip addr` — same crate `commands.rs` already uses, no
/// new dependency, and it returns interface names (needed for the
/// tunnel filter).
///
/// Falls back to common consumer subnet broadcasts if interface
/// enumeration yields nothing.
fn get_subnet_broadcasts() -> Vec<Ipv4Addr> {
    let ifaces = if_addrs::get_if_addrs().unwrap_or_default();

    // Project to the (name, is_loopback, ip, mask) tuples
    // `compute_subnet_broadcasts` works on, so we can drive the same logic
    // from synthetic inputs in tests.
    let projected: Vec<(String, bool, Ipv4Addr, Ipv4Addr)> = ifaces
        .into_iter()
        .filter_map(|iface| {
            // Capture loopback flag before moving `iface.addr`.
            let is_loopback = iface.is_loopback();
            match iface.addr {
                if_addrs::IfAddr::V4(v4) => {
                    Some((iface.name, is_loopback, v4.ip, v4.netmask))
                }
                // IPv4 only — discovery uses 255.255.255.255-style limited
                // broadcast which is an IPv4 concept; IPv6 uses multicast.
                if_addrs::IfAddr::V6(_) => None,
            }
        })
        .collect();

    let mut addrs = compute_subnet_broadcasts(&projected);
    if addrs.is_empty() {
        // Common subnet broadcasts as fallback when interface enumeration
        // returns nothing or every iface is filtered out.
        addrs.push(Ipv4Addr::new(192, 168, 1, 255));
        addrs.push(Ipv4Addr::new(192, 168, 0, 255));
        addrs.push(Ipv4Addr::new(10, 0, 0, 255));
    }
    addrs
}

/// Pure helper: given a list of `(iface_name, is_loopback, ip, netmask)`
/// tuples, return the subnet broadcast addresses for the non-loopback,
/// non-tunnel ifaces. Extracted so tests can drive it with synthetic input
/// (the real `if_addrs::get_if_addrs()` call isn't easily mockable).
fn compute_subnet_broadcasts(
    ifaces: &[(String, bool, Ipv4Addr, Ipv4Addr)],
) -> Vec<Ipv4Addr> {
    let mut out = Vec::new();
    for (name, is_loopback, ip, mask) in ifaces {
        if *is_loopback || crate::net::is_tunnel_interface(name) {
            continue;
        }
        let ip_bits = u32::from(*ip);
        let mask_bits = u32::from(*mask);
        let broadcast = Ipv4Addr::from(ip_bits | !mask_bits);
        if broadcast != Ipv4Addr::new(255, 255, 255, 255) {
            out.push(broadcast);
        }
    }
    out
}

#[cfg(test)]
mod broadcast_tests {
    use super::*;

    fn iface(name: &str, lo: bool, ip: &str, mask: &str) -> (String, bool, Ipv4Addr, Ipv4Addr) {
        (name.to_string(), lo, ip.parse().unwrap(), mask.parse().unwrap())
    }

    #[test]
    fn broadcasts_includes_lan_iface() {
        // /24 LAN: 192.168.1.0/24 → 192.168.1.255
        let ifaces = vec![iface("en0", false, "192.168.1.42", "255.255.255.0")];
        let bs = compute_subnet_broadcasts(&ifaces);
        assert_eq!(bs, vec!["192.168.1.255".parse::<Ipv4Addr>().unwrap()]);
    }

    #[test]
    fn broadcasts_skips_loopback() {
        let ifaces = vec![iface("lo0", true, "127.0.0.1", "255.0.0.0")];
        assert!(compute_subnet_broadcasts(&ifaces).is_empty());
    }

    #[test]
    fn broadcasts_skips_macos_utun_tunnel() {
        // VPN hands out 10.10.0.5/16 on utun3 — must NOT be in the broadcast set.
        let ifaces = vec![
            iface("utun3", false, "10.10.0.5", "255.255.0.0"),
            iface("en0", false, "192.168.1.42", "255.255.255.0"),
        ];
        let bs = compute_subnet_broadcasts(&ifaces);
        assert_eq!(bs.len(), 1);
        assert_eq!(bs[0], "192.168.1.255".parse::<Ipv4Addr>().unwrap());
    }

    #[test]
    fn broadcasts_skips_windows_anyconnect_tunnel() {
        // Cisco AnyConnect Windows friendly name + corporate VPN /16.
        let ifaces = vec![
            iface(
                "Cisco AnyConnect Secure Mobility Client Connection",
                false,
                "10.20.0.5",
                "255.255.0.0",
            ),
            iface("Ethernet", false, "192.168.0.10", "255.255.255.0"),
        ];
        let bs = compute_subnet_broadcasts(&ifaces);
        assert_eq!(bs, vec!["192.168.0.255".parse::<Ipv4Addr>().unwrap()]);
    }

    #[test]
    fn broadcasts_skips_wireguard_and_tailscale() {
        let ifaces = vec![
            iface("wg0", false, "10.30.0.5", "255.255.255.0"),
            iface("tailscale0", false, "100.64.0.5", "255.192.0.0"),
            iface("en0", false, "172.20.10.5", "255.255.255.240"), // /28 hotspot
        ];
        let bs = compute_subnet_broadcasts(&ifaces);
        // Only the hotspot iface survives. /28 broadcast for 172.20.10.0/28.
        assert_eq!(bs, vec!["172.20.10.15".parse::<Ipv4Addr>().unwrap()]);
    }

    #[test]
    fn broadcasts_drops_limited_broadcast_255_x4() {
        // A /0 iface would produce 255.255.255.255 — already covered by the
        // explicit limited-broadcast send, so skip it here to avoid dupes.
        let ifaces = vec![iface("en0", false, "10.0.0.1", "0.0.0.0")];
        assert!(compute_subnet_broadcasts(&ifaces).is_empty());
    }
}

fn packet_id(packet: &DiscoveryPacket) -> String {
    match packet {
        DiscoveryPacket::Ping(info) | DiscoveryPacket::Pong(info) => info.id.clone(),
        DiscoveryPacket::Offline(id) => id.clone(),
    }
}
