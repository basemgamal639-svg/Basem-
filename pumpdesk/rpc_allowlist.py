"""Strict RPC URL allowlist. Health checks never call these URLs."""
from __future__ import annotations

import ipaddress
import os
import socket
from urllib.parse import urlparse

# Official public clusters plus a local validator. Anything else is rejected.
# PAPER account reads may use the public mainnet endpoint. This is not a send path.
_DEFAULTS = (
    "https://api.mainnet-beta.solana.com",
    "https://api.devnet.solana.com",
    "http://127.0.0.1:8899",
    "http://localhost:8899",
)


def allowlist() -> set[str]:
    raw = os.environ.get("RPC_ALLOWLIST", "").strip()
    if not raw:
        return set(_DEFAULTS)
    return {part.strip().rstrip("/") for part in raw.split(",") if part.strip()}


def validate_rpc_url(url: str) -> tuple[bool, str]:
    candidate = (url or "").strip()
    if not candidate:
        return False, "rpc_url empty"
    if any(ch in candidate for ch in ("\n", "\r", " ")):
        return False, "rpc_url contains whitespace"
    parsed = urlparse(candidate)
    if parsed.scheme not in ("https", "http"):
        return False, "rpc_url scheme must be http or https"
    if parsed.username or parsed.password:
        return False, "rpc_url must not embed credentials"
    if parsed.query or parsed.fragment:
        return False, "rpc_url must not include a query or fragment"
    if parsed.scheme == "http" and (parsed.hostname or "") not in ("127.0.0.1", "localhost"):
        return False, "plain http rpc_url is only allowed for localhost"
    host = (parsed.hostname or "").lower()
    if host in ("169.254.169.254", "metadata.google.internal"):
        return False, "rpc_url host is blocked"
    normalized = candidate.rstrip("/")
    allowed = allowlist()
    if normalized not in allowed:
        return False, "rpc_url is not on the configured allowlist"
    return True, "ok"


def _is_loopback(ip: str) -> bool:
    return ipaddress.ip_address(ip).is_loopback


def _is_blocked_answer(ip: str) -> bool:
    addr = ipaddress.ip_address(ip)
    return addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_multicast or addr.is_reserved or addr.is_unspecified


def pin_resolved_host(url: str, resolver=None) -> tuple[bool, str]:
    """Fail closed on DNS rebinding. Loopback URLs may only resolve to loopback."""
    ok, why = validate_rpc_url(url)
    if not ok:
        return False, why
    host = (urlparse(url).hostname or "").lower()
    lookup = resolver or (lambda name: [item[4][0] for item in socket.getaddrinfo(name, None)])
    try:
        answers = lookup(host)
    except Exception:
        return False, "rpc host did not resolve"
    if not answers:
        return False, "rpc host did not resolve"
    if host in ("127.0.0.1", "localhost"):
        if all(_is_loopback(ip) for ip in answers):
            return True, "ok"
        return False, "localhost rpc resolved outside loopback"
    if any(_is_blocked_answer(ip) for ip in answers):
        return False, "public rpc name resolved to a blocked address"
    return True, "ok"
