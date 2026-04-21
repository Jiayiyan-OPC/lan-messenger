//! Shared networking utilities used by both the IPC command layer
//! (`commands.rs`) and the UDP discovery service (`discovery/udp.rs`).
//!
//! The motivating concern is **interface filtering**: any logic that
//! enumerates local interfaces — to pick a display IP, or to compute
//! subnet broadcast targets — must consistently exclude VPN / tunnel
//! interfaces. Otherwise we either mis-display the wrong IP (Brand row
//! shows the VPN tunnel address) or leak heartbeat broadcasts out the
//! tunnel and discover unrelated peers across the WAN. Keeping the
//! tunnel-detection rules in one place guarantees the two call sites
//! stay in sync.
//!
//! This module exposes:
//!
//! - [`is_tunnel_interface`] — name-based tunnel / VPN classifier.
//! - [`private_ipv4_rank`] — RFC1918 tier ordering for "best LAN IP" picks.
//!
//! Both functions are pure (no I/O) so they're trivially unit-testable.

use std::net::Ipv4Addr;

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
pub fn is_tunnel_interface(name: &str) -> bool {
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
pub fn private_ipv4_rank(ip: Ipv4Addr) -> Option<u8> {
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
