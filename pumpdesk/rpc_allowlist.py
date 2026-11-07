"""Strict RPC URL allowlist. Health checks never call these URLs."""
from __future__ import annotations

import os
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
