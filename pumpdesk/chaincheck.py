"""Interpret mocked RPC results. This module never sends and never calls the network.

A signature string alone is not a fill. Telegram 'Bought' is not a fill.
"""
from __future__ import annotations


def evaluate_fill(status_row: dict | None, transaction: dict | None, expected: dict) -> dict:
    """expected keys: signature, cluster, mint, destination, min_amount_out, side.

    status_row is one element of getSignatureStatuses value.
    transaction is a getTransaction result.
    """
    reasons = []
    if not status_row or not transaction:
        return {"filled": False, "reasons": ["missing status or transaction"]}
    if status_row.get("confirmationStatus") != "finalized":
        reasons.append("status is not finalized")
    if status_row.get("err") not in (None,):
        reasons.append("signature status err")
    if transaction.get("cluster") != expected.get("cluster"):
        reasons.append("cluster mismatch")
    if expected.get("cluster") not in ("devnet", "local"):
        reasons.append("cluster is not a test cluster")
    meta = transaction.get("meta") or {}
    if meta.get("err") not in (None,):
        reasons.append("meta.err")
    signatures = ((transaction.get("transaction") or {}).get("signatures")) or []
    if not signatures or signatures[0] != expected.get("signature"):
        reasons.append("transaction signature does not match")
    if status_row.get("signature") and status_row.get("signature") != expected.get("signature"):
        reasons.append("status signature does not match")
    delta = _token_delta(meta, expected.get("destination"), expected.get("mint"))
    if expected.get("side") == "buy" and delta < int(expected.get("min_amount_out") or 0):
        reasons.append("token delta below minimum")
    if expected.get("side") == "sell" and delta >= 0:
        reasons.append("sell did not reduce the token balance")
    message = (transaction.get("transaction") or {}).get("message")
    if message != expected.get("message"):
        reasons.append("message does not match the frozen preview")
    return {"filled": not reasons, "reasons": reasons, "token_delta": delta}


def _token_delta(meta: dict, owner: str, mint: str) -> int:
    pre = _sum(meta.get("preTokenBalances") or [], owner, mint)
    post = _sum(meta.get("postTokenBalances") or [], owner, mint)
    return post - pre


def _sum(rows, owner: str, mint: str) -> int:
    total = 0
    for row in rows:
        if row.get("owner") == owner and row.get("mint") == mint:
            ui = ((row.get("uiTokenAmount") or {}).get("amount")) or "0"
            total += int(ui)
    return total
