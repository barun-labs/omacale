#!/bin/bash
# net-links.sh: the links beside the default route, one "label<TAB>value" line
# each, for the network popout: Tailscale, VPN tunnels (FortiClient fctvpn*,
# ppp, tun, WireGuard) and any other wired link with an address. Omarchy's
# `omarchy-network-status` only reports the default route. From lun.network.

primary=${1:-$(ip route show default 2>/dev/null | awk '{ for (i = 1; i < NF; i++) if ($i == "dev") { print $(i + 1); exit } }')}

if command -v tailscale >/dev/null; then
  tailscale status --json 2>/dev/null | jq -r '
    select(.BackendState == "Running") |
    "Tailscale\t" + (.Self.TailscaleIPs[0] // "up") +
    (if .ExitNodeStatus then
      " · exit " + ([.Peer[] | select(.ExitNode) | .HostName][0] // "on")
    else "" end)'
fi

ip -4 -o addr show up 2>/dev/null | while read -r _ iface _ cidr _; do
  [[ $iface == "$primary" ]] && continue
  case $iface in
    fctvpn*|ppp*|tun*|wg*) printf 'VPN\t%s %s\n' "$iface" "${cidr%/*}" ;;
    en*|eth*) printf 'Wired\t%s %s\n' "$iface" "${cidr%/*}" ;;
  esac
done
