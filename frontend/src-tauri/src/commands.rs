use tauri::{command, AppHandle, Emitter, Manager};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::device::DeviceConfig;
use crate::storage::{Database, Contact, StoredMessage, FileTransfer};
use crate::discovery::DiscoveryService;
use crate::file_transfer::FileTransferHandle;
use crate::messenger::MessengerHandle;
use crate::protocol::types::{MessageType, TextMessage as ProtoTextMessage};

// ============================================================
// IPC Commands
// ============================================================

// --- Contacts ---

#[command]
pub async fn get_contacts(db: tauri::State<'_, Database>) -> Result<Vec<Contact>, String> {
    db.get_all_contacts().map_err(|e| e.to_string())
}

#[command]
pub async fn get_online_contacts(db: tauri::State<'_, Database>) -> Result<Vec<Contact>, String> {
    db.get_online_contacts().map_err(|e| e.to_string())
}

#[command]
pub async fn get_contact(id: String, db: tauri::State<'_, Database>) -> Result<Option<Contact>, String> {
    db.get_contact(&id).map_err(|e| e.to_string())
}

#[command]
pub async fn delete_contact(id: String, db: tauri::State<'_, Database>) -> Result<(), String> {
    db.delete_contact(&id).map_err(|e| e.to_string())
}

// --- Messages ---

#[command]
pub async fn get_messages(
    contact_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    db: tauri::State<'_, Database>,
) -> Result<Vec<StoredMessage>, String> {
    db.query_messages(contact_id.as_deref(), limit.unwrap_or(50), offset.unwrap_or(0))
        .map_err(|e| e.to_string())
}

#[command]
pub async fn get_message(id: String, db: tauri::State<'_, Database>) -> Result<Option<StoredMessage>, String> {
    db.get_message(&id).map_err(|e| e.to_string())
}

#[command]
pub async fn delete_message(id: String, db: tauri::State<'_, Database>) -> Result<(), String> {
    db.delete_message(&id).map_err(|e| e.to_string())
}

#[command]
pub async fn delete_messages_by_contact(
    contact_id: String,
    db: tauri::State<'_, Database>,
) -> Result<(), String> {
    db.delete_messages_by_contact(&contact_id).map_err(|e| e.to_string())
}

// --- Send Message ---

#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub recipient_id: String,
    pub content: String,
}

#[command]
pub async fn send_message(
    request: SendMessageRequest,
    app: AppHandle,
    db: tauri::State<'_, Database>,
    device: tauri::State<'_, DeviceConfig>,
) -> Result<StoredMessage, String> {
    let mut msg = StoredMessage {
        id: uuid::Uuid::new_v4().to_string(),
        sender_id: device.device_id.clone(),
        recipient_id: request.recipient_id,
        content: request.content,
        timestamp: chrono::Utc::now().timestamp_millis(),
        status: "sending".to_string(),
        file_transfer_id: None,
    };

    db.insert_message(&msg).map_err(|e| e.to_string())?;

    // Look up recipient to get their IP and port
    let contact = db.get_contact(&msg.recipient_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Contact {} not found", msg.recipient_id))?;

    let proto_msg = ProtoTextMessage {
        msg_type: MessageType::TextMsg as u8,
        msg_id: msg.id.clone(),
        from_id: device.device_id.clone(),
        timestamp: msg.timestamp as u64,
        content: msg.content.clone(),
    };

    let peer_addr = format!("{}:{}", contact.ip_address, contact.port)
        .parse()
        .map_err(|e: std::net::AddrParseError| e.to_string())?;

    let messenger = app.state::<MessengerHandle>();
    messenger.send_message(peer_addr, proto_msg)
        .await
        .map_err(|e| e.to_string())?;

    db.update_message_status(&msg.id, "sent").map_err(|e| e.to_string())?;
    // Sync the in-memory struct with the DB status before emitting / returning —
    // otherwise the frontend listener sees `status:"sending"` forever and the
    // bubble spinner never resolves to a check mark.
    msg.status = "sent".to_string();
    let _ = app.emit("message-sent", &msg);
    Ok(msg)
}

// --- Discovery ---

#[command]
pub async fn start_discovery(
    discovery: tauri::State<'_, Arc<crate::discovery::DiscoveryService>>,
) -> Result<(), String> {
    discovery.start().map_err(|e| e.to_string())
}

#[command]
pub async fn stop_discovery(
    discovery: tauri::State<'_, Arc<crate::discovery::DiscoveryService>>,
) -> Result<(), String> {
    discovery.stop();
    Ok(())
}

#[command]
pub async fn get_discovered_peers(
    discovery: tauri::State<'_, Arc<crate::discovery::DiscoveryService>>,
) -> Result<Vec<PeerResponse>, String> {
    let peers = discovery.get_peers();
    Ok(peers
        .into_iter()
        .map(|p| PeerResponse {
            id: p.info.id,
            name: p.info.name,
            ip_address: p.addr.ip().to_string(),
            port: p.info.port,
        })
        .collect())
}

#[derive(Debug, Clone, Serialize)]
pub struct PeerResponse {
    pub id: String,
    pub name: String,
    pub ip_address: String,
    pub port: u16,
}

// --- File Transfer ---

#[derive(Debug, Deserialize)]
pub struct FileTransferRequest {
    pub recipient_id: String,
    pub file_path: String,
}

#[command]
pub async fn initiate_file_transfer(
    request: FileTransferRequest,
    app: AppHandle,
    db: tauri::State<'_, Database>,
) -> Result<String, String> {
    let contact = db.get_contact(&request.recipient_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Contact {} not found", request.recipient_id))?;

    let peer_addr: std::net::SocketAddr = format!("{}:{}", contact.ip_address, crate::file_transfer::service::FILE_PORT)
        .parse()
        .map_err(|e: std::net::AddrParseError| e.to_string())?;

    let ft = app.state::<FileTransferHandle>();
    let transfer_id = ft.send_file(
        peer_addr,
        std::path::PathBuf::from(&request.file_path),
        request.recipient_id,
    ).await.map_err(|e| e.to_string())?;

    let _ = app.emit("file-transfer-initiated", &transfer_id);
    Ok(transfer_id)
}

#[command]
pub async fn accept_file_transfer(transfer_id: String, app: AppHandle) -> Result<(), String> {
    let _ = app.emit("file-transfer-accepted", &transfer_id);
    Ok(())
}

#[command]
pub async fn reject_file_transfer(transfer_id: String, app: AppHandle) -> Result<(), String> {
    let _ = app.emit("file-transfer-rejected", &transfer_id);
    Ok(())
}

// --- Device info ---

#[derive(Debug, Clone, Serialize)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub hostname: String,
    pub ip: String,
    pub os: String,
}

/// Returns true when an interface name matches a known VPN / tunnel pattern.
///
/// Case-insensitive. Conservative: false positives (treating a real LAN
/// interface as a tunnel) are worse than false negatives, so we only list
/// well-known tunnel name patterns. The interface name is the discriminator
/// because legitimate LAN ranges (10.x, 172.x) overlap with what many VPNs
/// hand out.
///
/// Two matching modes:
/// - **Prefix** for Unix short names (`utun0`, `tun0`, `tap0`, `wg0`, `ppp0`,
///   `zt0`, `tailscale0`). Substring matching here would be too aggressive —
///   e.g. `enp` shouldn't match `ppp`.
/// - **Substring** for Windows adapter "friendly names" returned by
///   `GetAdaptersAddresses`. These are human-readable strings like
///   `Cisco AnyConnect Secure Mobility Client Connection`, `WireGuard Tunnel: foo`,
///   `Tap-Windows Adapter V9`, `FortiClient`, `PANGP Virtual Ethernet Adapter`,
///   `Pulse Secure`, `Juniper Networks Virtual Adapter`, etc. Matching as
///   substrings catches all of these without enumerating each vendor's exact
///   product naming.
fn is_tunnel_interface(name: &str) -> bool {
    let n = name.to_ascii_lowercase();

    // Unix short names — prefix match.
    let unix_prefixes = [
        "utun",      // macOS VPN tunnels (Cisco AnyConnect, WireGuard, Tailscale, …)
        "tun",       // Linux OpenVPN, generic tun
        "tap",       // Linux OpenVPN, generic tap
        "wg",        // WireGuard
        "ppp",       // PPP / dial-up VPN
        "zt",        // ZeroTier
        "tailscale", // Tailscale userspace
    ];
    if unix_prefixes.iter().any(|p| n.starts_with(p)) {
        return true;
    }

    // Windows friendly names — substring match.
    let windows_substrings = [
        "vpn",
        "tunnel",
        "anyconnect",   // Cisco AnyConnect Secure Mobility Client
        "wireguard",    // WireGuard Tunnel: <name>
        "tap-windows",  // OpenVPN TAP-Windows6, Tap-Windows Adapter V9
        "fortinet",     // Fortinet SSL VPN Virtual Ethernet Adapter
        "forticlient",  // FortiClient
        "globalprotect", // Palo Alto GlobalProtect (no-space form)
        "global protect", // Palo Alto GlobalProtect (spaced form)
        "pangp",        // PANGP Virtual Ethernet Adapter
        "pulse secure", // Pulse Secure
        "juniper",      // Juniper Networks Virtual Adapter
        "hamachi",      // LogMeIn Hamachi
    ];
    windows_substrings.iter().any(|p| n.contains(p))
}

/// RFC1918 private-range tier ranking. Lower number = preferred.
/// Returns `None` for non-private addresses.
///
/// 1. 192.168.x.x — most common consumer LAN
/// 2. 172.16-31.x.x — common router LAN (RFC1918)
/// 3. 10.x.x.x — beware: many VPNs use 10.x; only accept on non-tunnel ifaces
fn private_ipv4_rank(ip: std::net::Ipv4Addr) -> Option<u8> {
    let o = ip.octets();
    if o[0] == 192 && o[1] == 168 {
        Some(1)
    } else if o[0] == 172 && (16..=31).contains(&o[1]) {
        Some(2)
    } else if o[0] == 10 {
        Some(3)
    } else {
        None
    }
}

/// Best-effort local IPv4 address that reflects the LAN interface used for
/// UDP broadcast — NOT the VPN tunnel.
///
/// The naïve "UDP connect 8.8.8.8 / read local_addr" trick returns whatever
/// interface the kernel's default route picks. With a VPN active, that's the
/// tunnel IP (e.g. 198.18.x.x corporate / 100.x.x.x Tailscale), which is
/// useless for displaying "the LAN you're on" and confuses peer pairing.
///
/// Strategy:
///   1. Enumerate interfaces with `if-addrs`.
///   2. Skip loopback and tunnel-named interfaces.
///   3. Among IPv4 RFC1918 addresses, pick the highest-ranked tier
///      (192.168 > 172.16/12 > 10/8).
///   4. Fallback to the UDP-connect trick if no private LAN address is found.
///   5. Final fallback: 127.0.0.1.
fn best_effort_local_ip() -> String {
    if let Ok(ifaces) = if_addrs::get_if_addrs() {
        let mut best: Option<(u8, std::net::Ipv4Addr)> = None;
        for iface in ifaces {
            if iface.is_loopback() || is_tunnel_interface(&iface.name) {
                continue;
            }
            let ip = match iface.ip() {
                std::net::IpAddr::V4(v4) => v4,
                std::net::IpAddr::V6(_) => continue, // IPv4 only for this batch
            };
            if let Some(rank) = private_ipv4_rank(ip) {
                if best.as_ref().map_or(true, |(b, _)| rank < *b) {
                    best = Some((rank, ip));
                }
            }
        }
        if let Some((_, ip)) = best {
            return ip.to_string();
        }
    }

    // Fallback: UDP-connect trick. The kernel picks whatever interface owns
    // the default route — which on a VPN-active machine is the tunnel. To
    // avoid leaking the VPN IP, we look the returned address back up in
    // `if_addrs` and reject it if it lives on a tunnel-named iface. If the
    // lookup fails (rare — racing with iface teardown), keep the IP rather
    // than throwing it away. Net effect on a VPN-only machine (no LAN at all)
    // is that we display 127.0.0.1; that's the correct conservative choice
    // since LAN discovery wouldn't work over the VPN anyway.
    use std::net::UdpSocket;
    if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
        if sock.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = sock.local_addr() {
                let ip = addr.ip();
                if !ip.is_unspecified() && !ip.is_loopback() {
                    if ip_belongs_to_tunnel(ip) {
                        // VPN tunnel — drop to loopback rather than mislead.
                        return "127.0.0.1".to_string();
                    }
                    return ip.to_string();
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

/// Looks `ip` up in `if_addrs::get_if_addrs()` and returns true if the owning
/// interface matches `is_tunnel_interface`. Returns false if the lookup fails
/// or no interface owns the IP — better to keep a possibly-wrong IP than to
/// throw away a possibly-right one when we can't tell.
fn ip_belongs_to_tunnel(ip: std::net::IpAddr) -> bool {
    let Ok(ifaces) = if_addrs::get_if_addrs() else {
        return false;
    };
    for iface in ifaces {
        if iface.ip() == ip {
            return is_tunnel_interface(&iface.name);
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tunnel_interface_matches_macos_utun() {
        assert!(is_tunnel_interface("utun0"));
        assert!(is_tunnel_interface("utun3"));
        assert!(is_tunnel_interface("UTUN5"));
    }

    #[test]
    fn tunnel_interface_matches_linux_tun_tap() {
        assert!(is_tunnel_interface("tun0"));
        assert!(is_tunnel_interface("tap0"));
        assert!(is_tunnel_interface("Tun7"));
    }

    #[test]
    fn tunnel_interface_matches_wireguard_zerotier_tailscale_ppp() {
        assert!(is_tunnel_interface("wg0"));
        assert!(is_tunnel_interface("zt0"));
        assert!(is_tunnel_interface("tailscale0"));
        assert!(is_tunnel_interface("ppp0"));
    }

    #[test]
    fn tunnel_interface_does_not_match_lan_interfaces() {
        assert!(!is_tunnel_interface("en0"));
        assert!(!is_tunnel_interface("en1"));
        assert!(!is_tunnel_interface("eth0"));
        assert!(!is_tunnel_interface("ens33"));
        assert!(!is_tunnel_interface("enp0s3"));
        assert!(!is_tunnel_interface("wlan0"));
        assert!(!is_tunnel_interface("wlp3s0"));
        assert!(!is_tunnel_interface("lo0"));
        // Windows-style LAN adapters that should NOT be flagged.
        assert!(!is_tunnel_interface("Ethernet"));
        assert!(!is_tunnel_interface("Ethernet 2"));
        assert!(!is_tunnel_interface("Wi-Fi"));
        assert!(!is_tunnel_interface("Local Area Connection"));
        assert!(!is_tunnel_interface("Realtek PCIe GbE Family Controller"));
        assert!(!is_tunnel_interface("Intel(R) Wi-Fi 6 AX201 160MHz"));
    }

    #[test]
    fn tunnel_interface_matches_windows_anyconnect() {
        assert!(is_tunnel_interface(
            "Cisco AnyConnect Secure Mobility Client Connection"
        ));
        assert!(is_tunnel_interface("Cisco Systems VPN Adapter"));
    }

    #[test]
    fn tunnel_interface_matches_windows_wireguard_tunnel() {
        assert!(is_tunnel_interface("WireGuard Tunnel: home"));
        // Even without "wireguard" prefix, the literal "Tunnel" substring catches it.
        assert!(is_tunnel_interface("My Tunnel Adapter"));
    }

    #[test]
    fn tunnel_interface_matches_windows_openvpn_tap() {
        assert!(is_tunnel_interface("OpenVPN TAP-Windows6"));
        assert!(is_tunnel_interface("Tap-Windows Adapter V9"));
        assert!(is_tunnel_interface("TAP-Windows Adapter V9 #2"));
    }

    #[test]
    fn tunnel_interface_matches_windows_forticlient() {
        assert!(is_tunnel_interface("FortiClient"));
        assert!(is_tunnel_interface(
            "Fortinet SSL VPN Virtual Ethernet Adapter"
        ));
    }

    #[test]
    fn tunnel_interface_matches_windows_globalprotect() {
        assert!(is_tunnel_interface("PANGP Virtual Ethernet Adapter"));
        assert!(is_tunnel_interface("PANGP Virtual Ethernet Adapter Secure"));
        assert!(is_tunnel_interface("GlobalProtect")); // no-space form
        assert!(is_tunnel_interface("Global Protect")); // spaced form
    }

    #[test]
    fn tunnel_interface_matches_windows_pulse_secure_juniper() {
        assert!(is_tunnel_interface("Pulse Secure"));
        assert!(is_tunnel_interface("Juniper Networks Virtual Adapter"));
    }

    #[test]
    fn tunnel_interface_matches_windows_hamachi() {
        assert!(is_tunnel_interface("Hamachi"));
        assert!(is_tunnel_interface("LogMeIn Hamachi Virtual Ethernet Adapter"));
    }

    #[test]
    fn tunnel_interface_matches_generic_vpn_substring() {
        // Catch-all: anything with "VPN" anywhere in the name.
        assert!(is_tunnel_interface("Sophos SSL VPN Adapter"));
        assert!(is_tunnel_interface("Check Point VPN-1 SecuRemote"));
        assert!(is_tunnel_interface("My Custom VPN Adapter"));
    }

    #[test]
    fn private_rank_orders_192_168_first() {
        let r192 = private_ipv4_rank("192.168.1.10".parse().unwrap()).unwrap();
        let r172 = private_ipv4_rank("172.20.0.5".parse().unwrap()).unwrap();
        let r10 = private_ipv4_rank("10.0.0.5".parse().unwrap()).unwrap();
        assert!(r192 < r172);
        assert!(r172 < r10);
    }

    #[test]
    fn private_rank_excludes_172_15_and_172_32() {
        // 172.16.0.0 – 172.31.255.255 is RFC1918; 172.15 / 172.32 are not.
        assert!(private_ipv4_rank("172.15.0.1".parse().unwrap()).is_none());
        assert!(private_ipv4_rank("172.32.0.1".parse().unwrap()).is_none());
        assert!(private_ipv4_rank("172.16.0.1".parse().unwrap()).is_some());
        assert!(private_ipv4_rank("172.31.255.254".parse().unwrap()).is_some());
    }

    #[test]
    fn private_rank_rejects_public_and_vpn_ranges() {
        // 198.18.x.x is RFC2544 benchmark — many corporate VPNs assign here.
        assert!(private_ipv4_rank("198.18.0.1".parse().unwrap()).is_none());
        // 100.64.0.0/10 — Tailscale CGNAT range.
        assert!(private_ipv4_rank("100.100.0.5".parse().unwrap()).is_none());
        assert!(private_ipv4_rank("8.8.8.8".parse().unwrap()).is_none());
    }

    #[test]
    fn private_rank_192_168_boundaries() {
        // Just outside 192.168/16 (low side).
        assert!(private_ipv4_rank("192.167.255.254".parse().unwrap()).is_none());
        // Exact start.
        assert!(private_ipv4_rank("192.168.0.0".parse().unwrap()).is_some());
        // Exact end.
        assert!(private_ipv4_rank("192.168.255.255".parse().unwrap()).is_some());
        // Just outside (high side).
        assert!(private_ipv4_rank("192.169.0.0".parse().unwrap()).is_none());
    }

    #[test]
    fn private_rank_10_8_boundaries() {
        // Just outside 10/8 (low side).
        assert!(private_ipv4_rank("9.255.255.255".parse().unwrap()).is_none());
        // Exact start.
        assert!(private_ipv4_rank("10.0.0.0".parse().unwrap()).is_some());
        // Exact end.
        assert!(private_ipv4_rank("10.255.255.255".parse().unwrap()).is_some());
        // Just outside (high side).
        assert!(private_ipv4_rank("11.0.0.0".parse().unwrap()).is_none());
    }
}

// Sync command on purpose: `best_effort_local_ip` uses `std::net::UdpSocket`
// which is blocking — `#[command] fn` (not `async fn`) lets Tauri dispatch
// the call onto a blocking thread instead of parking an async worker.
#[command]
pub fn get_device_info(device: tauri::State<'_, DeviceConfig>) -> Result<DeviceInfo, String> {
    let hostname = hostname::get()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|_| device.device_name.clone());
    Ok(DeviceInfo {
        id: device.device_id.clone(),
        name: device.device_name.clone(),
        hostname,
        ip: best_effort_local_ip(),
        os: std::env::consts::OS.to_string(),
    })
}
