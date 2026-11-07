"""Simulated, non-executable transaction previews.

BROADCAST_ENABLED is a constant False. This module has no send path.
"""
from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime, timedelta, timezone

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

BROADCAST_ENABLED = False
BANNER = "SIMULATED — NOT AN EXECUTABLE TRANSACTION"
ALLOWED_CLUSTERS = ("devnet", "local")
SIM_MAX_LAMPORTS = 1_000_000_000
PREVIEW_TTL = timedelta(seconds=45)
_B58 = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")


class SimError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class SimStore:
    def __init__(self):
        self.rows: dict[str, dict] = {}
        self.by_idempotency: dict[str, str] = {}
        self.used_signatures: set[str] = set()
        self.stopped = False

    def stop(self) -> None:
        self.stopped = True

    def clear_stop(self) -> None:
        self.stopped = False


def canonical_message(row: dict) -> str:
    lines = [
        BANNER,
        f"intent={row['id']}",
        f"cluster={row['cluster']}",
        f"mint={row['mint']}",
        f"name={row['name']}",
        f"symbol={row['symbol']}",
        f"decimals={row['decimals']}",
        f"side={row['side']}",
        f"amount_base={row['amount_base']}",
        f"destination={row['destination']}",
        f"max_lamports_in={row['max_lamports_in']}",
        f"min_amount_out={row['min_amount_out']}",
        f"slippage_bps={row['slippage_bps']}",
        f"fee_lamports_ceiling={row['fee_lamports_ceiling']}",
        f"expires_at={row['expires_at']}",
    ]
    return "\n".join(lines)


def message_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _check_limits(body: dict) -> None:
    lamports = int(body["max_lamports_in"]) + int(body["fee_lamports_ceiling"])
    if lamports > SIM_MAX_LAMPORTS:
        raise SimError("limit", "lamport ceiling exceeds the simulated cap")
    if int(body["amount_base"]) <= 0:
        raise SimError("limit", "amount_base must be positive")
    if not (0 <= int(body["slippage_bps"]) <= 500):
        raise SimError("limit", "slippage_bps must be 0..500 in simulation")
    if not (0 <= int(body["decimals"]) <= 18):
        raise SimError("limit", "decimals out of range")


def _check_identity(body: dict) -> None:
    cluster = str(body.get("cluster") or "")
    if cluster not in ALLOWED_CLUSTERS:
        raise SimError("cluster", "cluster must be devnet or local; mainnet is rejected")
    for field in ("mint", "destination"):
        if not _B58.match(str(body.get(field) or "")):
            raise SimError("schema", f"{field} is not a base58 address")
    if body.get("side") not in ("buy", "sell"):
        raise SimError("schema", "side must be buy or sell")


def create_preview(store: SimStore, body: dict, idempotency_key: str | None) -> dict:
    if store.stopped:
        raise SimError("stopped", "emergency stop is on; no new previews")
    if BROADCAST_ENABLED:
        raise SimError("broadcast", "broadcast flag must stay false")
    _check_identity(body)
    _check_limits(body)
    if idempotency_key:
        existing_id = store.by_idempotency.get(idempotency_key)
        if existing_id:
            existing = store.rows[existing_id]
            if existing["fingerprint"] != _fingerprint(body):
                raise SimError("idempotency", "idempotency key reused with a different body")
            return _public(existing)
    preview_id = str(uuid.uuid4())
    expires = (_now() + PREVIEW_TTL).strftime("%Y-%m-%dT%H:%M:%SZ")
    row = {
        "id": preview_id,
        "cluster": body["cluster"],
        "mint": body["mint"],
        "name": body["name"],
        "symbol": body["symbol"],
        "decimals": int(body["decimals"]),
        "side": body["side"],
        "amount_base": int(body["amount_base"]),
        "destination": body["destination"],
        "max_lamports_in": int(body["max_lamports_in"]),
        "min_amount_out": int(body["min_amount_out"]),
        "slippage_bps": int(body["slippage_bps"]),
        "fee_lamports_ceiling": int(body["fee_lamports_ceiling"]),
        "expires_at": expires,
        "status": "open",
        "fingerprint": _fingerprint(body),
        "banner": BANNER,
        "executable": False,
    }
    text = canonical_message(row)
    row["canonical"] = text
    row["message_sha256"] = message_hash(text)
    store.rows[preview_id] = row
    if idempotency_key:
        store.by_idempotency[idempotency_key] = preview_id
    return _public(row)


def get_preview(store: SimStore, preview_id: str) -> dict:
    row = store.rows.get(preview_id)
    if not row:
        raise SimError("missing", "preview not found")
    if _expired(row):
        row["status"] = "expired"
        raise SimError("expired", "preview expired")
    return _public(row)


def verify_preview(store: SimStore, preview_id: str, public_key: bytes, signature: bytes, claimed_hash: str) -> dict:
    if store.stopped:
        raise SimError("stopped", "emergency stop is on; verification refused")
    if BROADCAST_ENABLED:
        raise SimError("broadcast", "broadcast flag must stay false")
    row = store.rows.get(preview_id)
    if not row:
        raise SimError("missing", "preview not found")
    if _expired(row) or row["status"] == "expired":
        row["status"] = "expired"
        raise SimError("expired", "preview expired")
    if row["status"] == "verified":
        raise SimError("replay", "preview already verified")
    if claimed_hash != row["message_sha256"]:
        raise SimError("hash", "message hash does not match the frozen preview")
    sig_hex = signature.hex()
    if sig_hex in store.used_signatures:
        raise SimError("replay", "signature already used")
    try:
        Ed25519PublicKey.from_public_bytes(public_key).verify(signature, row["canonical"].encode("utf-8"))
    except Exception as exc:
        raise SimError("signature", "signature verification failed") from exc
    row["status"] = "verified"
    row["executable"] = False
    store.used_signatures.add(sig_hex)
    return {
        "ok": True,
        "preview_id": preview_id,
        "message_sha256": row["message_sha256"],
        "banner": BANNER,
        "executable": False,
        "broadcast_enabled": False,
        "cluster": row["cluster"],
    }


def _expired(row: dict) -> bool:
    try:
        expires = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    except ValueError:
        return True
    return _now() >= expires


def _fingerprint(body: dict) -> str:
    material = "|".join(
        str(body[key])
        for key in (
            "cluster",
            "mint",
            "name",
            "symbol",
            "decimals",
            "side",
            "amount_base",
            "destination",
            "max_lamports_in",
            "min_amount_out",
            "slippage_bps",
            "fee_lamports_ceiling",
        )
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _public(row: dict) -> dict:
    return {
        "id": row["id"],
        "banner": BANNER,
        "executable": False,
        "broadcast_enabled": False,
        "cluster": row["cluster"],
        "mint": row["mint"],
        "name": row["name"],
        "symbol": row["symbol"],
        "decimals": row["decimals"],
        "side": row["side"],
        "amount_base": row["amount_base"],
        "destination": row["destination"],
        "max_lamports_in": row["max_lamports_in"],
        "min_amount_out": row["min_amount_out"],
        "slippage_bps": row["slippage_bps"],
        "fee_lamports_ceiling": row["fee_lamports_ceiling"],
        "expires_at": row["expires_at"],
        "message_sha256": row["message_sha256"],
        "canonical": row["canonical"],
        "status": row["status"],
    }
