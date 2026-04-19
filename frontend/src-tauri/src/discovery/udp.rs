use std::collections::HashMap;
use std::net::{SocketAddr, UdpSocket, Ipv4Addr};
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

        let socket = UdpSocket::bind(("0.0.0.0", self.config.broadcast_port))?;
        socket.set_broadcast(true)?;
        socket.set_read_timeout(Some(Duration::from_secs(1)))?;

        let recv_socket = socket.try_clone()?;

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

            let addr = SocketAddr::new(BROADCAST_ADDR.into(), broadcast_port);
            while *running.lock().unwrap() {
                let _ = socket.send_to(&frame, addr);
                thread::sleep(heartbeat_interval);
            }

            // Send offline notification
            let offline = DiscoveryPacket::Offline(packet_id(&packet));
            if let Ok(data) = rmp_serde::to_vec(&offline) {
                let mut frame = Vec::with_capacity(MAGIC.len() + data.len());
                frame.extend_from_slice(MAGIC);
                frame.extend_from_slice(&data);
                let _ = socket.send_to(&frame, addr);
            }
        });

        // Receiver thread
        let peers = Arc::clone(&self.peers);
        let running = Arc::clone(&self.running);
        let timeout = self.config.timeout_threshold;
        let my_id = self.config.device_id.clone();
        let event_tx = self.event_tx.clone();

        thread::spawn(move || {
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
                            DiscoveryPacket::Ping(info) | DiscoveryPacket::Pong(info) => {
                                if info.id == my_id {
                                    continue; // Ignore our own broadcasts
                                }
                                let mut peers = peers.lock().unwrap();
                                let is_new = !peers.contains_key(&info.id);
                                let peer = DiscoveredPeer {
                                    info: info.clone(),
                                    addr,
                                    last_seen: Instant::now(),
                                };
                                peers.insert(info.id.clone(), peer.clone());

                                if let Some(tx) = &event_tx {
                                    if is_new {
                                        let _ = tx.send(DiscoveryEvent::PeerFound(peer));
                                    } else {
                                        let _ = tx.send(DiscoveryEvent::PeerUpdated(peer));
                                    }
                                }
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

fn packet_id(packet: &DiscoveryPacket) -> String {
    match packet {
        DiscoveryPacket::Ping(info) | DiscoveryPacket::Pong(info) => info.id.clone(),
        DiscoveryPacket::Offline(id) => id.clone(),
    }
}
