"""Outbound URL policy. Every user-supplied URL passes through here before a
single byte is requested, and again on every redirect hop.

Blocked: non-http(s) schemes, credentials in the URL, hostnames that resolve
to loopback, link-local, private, multicast, reserved, or cloud-metadata
addresses (IPv4 and IPv6), bare IP literals in those ranges, and internal
names without a public suffix."""
from __future__ import annotations

import ipaddress
import re
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit

ALLOWED_SCHEMES = {"http", "https"}
BLOCKED_HOSTS = {"localhost", "metadata.google.internal", "metadata", "instance-data"}
METADATA_IPS = {"169.254.169.254", "fd00:ec2::254", "100.100.100.200"}


class UnsafeURL(ValueError):
    """Raised when a URL must not be fetched. Message is safe to show users."""


@dataclass(frozen=True)
class SafeTarget:
    url: str
    host: str
    port: int
    addresses: tuple[str, ...]


def _is_public_ip(ip: ipaddress._BaseAddress) -> bool:
    if str(ip) in METADATA_IPS:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        return _is_public_ip(ip.ipv4_mapped)
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
        or (isinstance(ip, ipaddress.IPv6Address) and ip.is_site_local)
    )


def normalize(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        raise UnsafeURL("Enter a website address.")
    scheme_match = re.match(r"^([a-z][a-z0-9+.-]*):", raw, re.I)
    if scheme_match and scheme_match.group(1).lower() not in ALLOWED_SCHEMES and "://" not in raw:
        raise UnsafeURL("Only http and https addresses can be examined.")
    if "://" not in raw:
        raw = "https://" + raw
    parts = urlsplit(raw)
    if parts.scheme.lower() not in ALLOWED_SCHEMES:
        raise UnsafeURL("Only http and https addresses can be examined.")
    if parts.username or parts.password:
        raise UnsafeURL("Addresses with embedded credentials are not accepted.")
    if not parts.hostname:
        raise UnsafeURL("That address has no host name.")
    host = parts.hostname.lower().rstrip(".")
    host_part = f"[{host}]" if ":" in host else host
    try:
        port = parts.port
    except ValueError:
        raise UnsafeURL("That address has an invalid port.")
    netloc = host_part if port is None else f"{host_part}:{port}"
    return urlunsplit((parts.scheme.lower(), netloc, parts.path or "/", parts.query, ""))


def validate(raw: str, *, resolver=None) -> SafeTarget:
    """Normalise, then resolve and check every address the host maps to."""
    url = normalize(raw)
    parts = urlsplit(url)
    host = parts.hostname or ""
    port = parts.port or (443 if parts.scheme == "https" else 80)

    if host in BLOCKED_HOSTS or host.endswith((".local", ".internal", ".localhost", ".lan", ".home", ".corp")):
        raise UnsafeURL("Internal and local addresses cannot be examined.")

    try:
        literal = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        literal = None

    if literal is not None:
        if not _is_public_ip(literal):
            raise UnsafeURL("Private and reserved IP addresses cannot be examined.")
        return SafeTarget(url=url, host=host, port=port, addresses=(str(literal),))

    if "." not in host:
        raise UnsafeURL("Enter a full domain name, for example example.com.")

    resolver = resolver or _resolve
    try:
        addresses = resolver(host, port)
    except socket.gaierror:
        raise UnsafeURL("That domain name could not be resolved.")
    if not addresses:
        raise UnsafeURL("That domain name could not be resolved.")
    for addr in addresses:
        if not _is_public_ip(ipaddress.ip_address(addr)):
            raise UnsafeURL("That address resolves to a private network and cannot be examined.")
    return SafeTarget(url=url, host=host, port=port, addresses=tuple(addresses))


def _resolve(host: str, port: int) -> list[str]:
    infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    seen: list[str] = []
    for info in infos:
        addr = info[4][0]
        if addr not in seen:
            seen.append(addr)
    return seen
