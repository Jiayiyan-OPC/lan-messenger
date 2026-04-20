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

/// Get subnet broadcast addresses for all network interfaces.
/// Falls back to 255.255.255.255 if detection fails.
fn get_subnet_broadcasts() -> Vec<Ipv4Addr> {
    let mut addrs = Vec::new();

    #[cfg(unix)]
    {
        // Try to get interfaces via /proc (Linux) or ifconfig-style detection
        if let Ok(interfaces) = get_local_ipv4_addrs() {
            for (ip, mask) in interfaces {
                let ip_bits = u32::from(ip);
                let mask_bits = u32::from(mask);
                let broadcast = Ipv4Addr::from(ip_bits | !mask_bits);
                if broadcast != Ipv4Addr::new(255, 255, 255, 255) {
                    addrs.push(broadcast);
                }
            }
        }
    }

    if addrs.is_empty() {
        // Common subnet broadcasts as fallback
        addrs.push(Ipv4Addr::new(192, 168, 1, 255));
        addrs.push(Ipv4Addr::new(192, 168, 0, 255));
        addrs.push(Ipv4Addr::new(10, 0, 0, 255));
    }

    addrs
}

/// Get local IPv4 addresses and their subnet masks.
#[cfg(unix)]
fn get_local_ipv4_addrs() -> std::io::Result<Vec<(Ipv4Addr, Ipv4Addr)>> {
    use std::process::Command;
    let mut results = Vec::new();

    // Parse `ip addr` output on Linux, `ifconfig` on macOS
    #[cfg(target_os = "linux")]
    {
        if let Ok(output) = Command::new("ip").args(["-4", "addr", "show"]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let line = line.trim();
                if line.starts_with("inet ") {
                    // Format: inet 192.168.1.100/24 ...
                    if let Some(cidr) = line.split_whitespace().nth(1) {
                        if let Some((ip_str, prefix_str)) = cidr.split_once('/') {
                            if let (Ok(ip), Ok(prefix)) = (ip_str.parse::<Ipv4Addr>(), prefix_str.parse::<u32>()) {
                                if !ip.is_loopback() && prefix <= 32 {
                                    let mask = if prefix == 0 { 0u32 } else { !0u32 << (32 - prefix) };
                                    results.push((ip, Ipv4Addr::from(mask)));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("ifconfig").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut current_ip: Option<Ipv4Addr> = None;
            for line in stdout.lines() {
                let line = line.trim();
                if line.starts_with("inet ") && !line.contains("127.0.0.1") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if let Some(ip_str) = parts.get(1) {
                        if let Ok(ip) = ip_str.parse::<Ipv4Addr>() {
                            current_ip = Some(ip);
                        }
                    }
                    if let Some(mask_idx) = parts.iter().position(|&p| p == "netmask") {
                        if let Some(mask_hex) = parts.get(mask_idx + 1) {
                            // macOS netmask is hex: 0xffffff00
                            let mask_str = mask_hex.trim_start_matches("0x");
                            if let Ok(mask_val) = u32::from_str_radix(mask_str, 16) {
                                if let Some(ip) = current_ip {
                                    results.push((ip, Ipv4Addr::from(mask_val)));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(results)
}

fn packet_id(packet: &DiscoveryPacket) -> String {
    match packet {
        DiscoveryPacket::Ping(info) | DiscoveryPacket::Pong(info) => info.id.clone(),
        DiscoveryPacket::Offline(id) => id.clone(),
    }
}
