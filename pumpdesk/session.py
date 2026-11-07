"""One-use wallet login. The legacy APP_TOKEN cannot call these functions."""
from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

ALLOWED_CLUSTERS = ("devnet", "local")
_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


class SessionError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def b58encode(raw: bytes) -> str:
    num = int.from_bytes(raw, "big")
    chars = []
    while num:
        num, rem = divmod(num, 58)
        chars.append(_B58[rem])
    pad = len(raw) - len(raw.lstrip(b"\x00"))
    encoded = "".join(reversed(chars)) or ""
    return ("1" * pad) + encoded


def b58decode(text: str) -> bytes:
    num = 0
    for char in text:
        idx = _B58.find(char)
        if idx < 0:
            raise SessionError("schema", "wallet is not base58")
        num = num * 58 + idx
    raw = num.to_bytes((num.bit_length() + 7) // 8, "big") if num else b""
    pad = 0
    for char in text:
        if char != "1":
            break
        pad += 1
    return b"\x00" * pad + raw


def login_message(domain: str, wallet: str, cluster: str, nonce: str, expires: str) -> str:
    return "\n".join([
        "Pump Desk login",
        f"domain={domain}",
        f"wallet={wallet}",
        f"cluster={cluster}",
        f"nonce={nonce}",
        f"expires={expires}",
    ])


def issue_nonce(db, wallet: str, cluster: str, domain: str) -> dict:
    if cluster not in ALLOWED_CLUSTERS:
        raise SessionError("cluster", "login cluster must be devnet or local")
    try:
        raw = b58decode(wallet)
    except SessionError:
        raise
    if len(raw) != 32:
        raise SessionError("schema", "wallet must be a 32-byte public key")
    nonce = secrets.token_urlsafe(24)
    expires = (datetime.now(timezone.utc) + timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    message = login_message(domain, wallet, cluster, nonce, expires)
    db.insert_nonce(nonce, wallet, cluster, domain, message, expires)
    return {"nonce": nonce, "message": message, "expires_at": expires, "wallet": wallet, "cluster": cluster}


def verify_login(db, wallet: str, cluster: str, nonce: str, signature: bytes, public_key: bytes, domain: str) -> dict:
    row = db.take_nonce(nonce)
    if not row:
        raise SessionError("nonce", "nonce missing or already used")
    if row["domain"] != domain or row["wallet"] != wallet or row["cluster"] != cluster:
        raise SessionError("nonce", "nonce does not match this domain, wallet, and cluster")
    try:
        expires = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    except ValueError:
        raise SessionError("expired", "nonce expiry is unreadable")
    if datetime.now(timezone.utc) >= expires:
        raise SessionError("expired", "nonce expired")
    if b58decode(wallet) != public_key:
        raise SessionError("wallet", "public key does not match wallet address")
    owner = os.environ.get("DESK_OWNER_WALLET", "").strip()
    if not owner or wallet != owner:
        raise SessionError("owner", "wallet is not the configured owner")
    try:
        Ed25519PublicKey.from_public_bytes(public_key).verify(signature, row["message"].encode("utf-8"))
    except Exception as exc:
        raise SessionError("signature", "login signature rejected") from exc
    session_id = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(16)
    session_expires = (datetime.now(timezone.utc) + timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M:%SZ")
    db.save_session(hashlib.sha256(session_id.encode()).hexdigest(), wallet, cluster, csrf, session_expires)
    return {
        "session_id": session_id,
        "csrf": csrf,
        "wallet": wallet,
        "cluster": cluster,
        "expires_at": session_expires,
    }


def session_from_cookie(db, session_id: str | None) -> dict | None:
    if not session_id:
        return None
    row = db.get_session(hashlib.sha256(session_id.encode()).hexdigest())
    if not row:
        return None
    try:
        expires = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    except ValueError:
        return None
    if datetime.now(timezone.utc) >= expires:
        return None
    return row
