"""THE ONLY place Pump.fun URLs are built."""
from __future__ import annotations

import logging

log = logging.getLogger("links")

CHAIN_ID = {"solana": 1399811149, "robinhood": 4663, "base": 8453, "bnb": 56}
SIGNUP_URL = "https://pump.fun"
HOME_URL = "https://pump.fun"


def coin_url(address: str, chain: str = "solana") -> str:
    if chain not in CHAIN_ID:
        log.warning("unknown chain for coin_url: %s", chain)
        return HOME_URL
    return f"https://pump.fun/coin/{address}"


def profile_url(handle: str) -> str:
    h = (handle or "").lstrip("@")
    return f"https://pump.fun/profile/{h}"
