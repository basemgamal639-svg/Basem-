"""Raw key mapping from STEP 2 samples. Unknown keys stay null — never guess."""
from __future__ import annotations

from typing import Any


def dig(obj: Any, path: str, default=None):
    """Walk dotted path; return default if any hop missing."""
    cur = obj
    for part in path.split("."):
        if cur is None:
            return default
        if isinstance(cur, dict):
            if part not in cur:
                return default
            cur = cur[part]
        else:
            return default
    return cur


# PumpPortal migration — keys unknown until a live sample is captured.
# We accept common candidates; first hit wins. Missing stays null.
PUMPPORTAL_MINT_KEYS = ("mint", "tokenMint", "baseMint")
PUMPPORTAL_POOL_KEYS = ("pool", "poolAddress", "bondingCurve", "pair")
PUMPPORTAL_SIG_KEYS = ("signature", "tx", "signatureBase58")
PUMPPORTAL_CREATOR_KEYS = ("creator", "traderPublicKey", "user", "dev")


def pumpportal_field(msg: dict, kind: str):
    keys = {
        "mint": PUMPPORTAL_MINT_KEYS,
        "pool": PUMPPORTAL_POOL_KEYS,
        "signature": PUMPPORTAL_SIG_KEYS,
        "creator": PUMPPORTAL_CREATOR_KEYS,
    }.get(kind, ())
    for k in keys:
        v = dig(msg, k)
        if v is not None and v != "":
            return v
    return None


def dexscreener_pumpswap_pair(pairs: list | None) -> dict | None:
    if not pairs:
        return None
    pumpswap = [p for p in pairs if dig(p, "dexId") == "pumpswap"]
    pool = pumpswap or list(pairs)
    best = None
    best_liq = -1.0
    for p in pool:
        liq = dig(p, "liquidity.usd")
        try:
            liq_f = float(liq) if liq is not None else 0.0
        except (TypeError, ValueError):
            liq_f = 0.0
        if liq_f >= best_liq:
            best_liq = liq_f
            best = p
    return best


def rugcheck_lp_locked_pct(report: dict | None, pool: str | None):
    if not report or not pool:
        return None
    markets = dig(report, "markets") or []
    if not isinstance(markets, list):
        return None
    for m in markets:
        pubkey = dig(m, "pubkey") or dig(m, "market") or dig(m, "pool")
        if pubkey == pool:
            pct = dig(m, "lp.lpLockedPct")
            if pct is None:
                return None
            try:
                return float(pct)
            except (TypeError, ValueError):
                return None
    return None


def rugcheck_graph_has_edges(graph) -> bool | None:
    """None = no usable graph; True/False based on edges key presence."""
    if graph is None:
        return None
    if isinstance(graph, list):
        # empty list [] — no edges key
        return False
    if isinstance(graph, dict):
        if "edges" not in graph:
            return False
        return True
    return None
