"""Quarantine unsafe legacy settings. Historical values are kept, not applied."""
from __future__ import annotations

import json

from rpc_allowlist import validate_rpc_url

SAFE_MODE = "PAPER"
SAFE_RPC = "https://api.devnet.solana.com"


def reason_for(key: str, value) -> str | None:
    text = str(value).strip()
    low = key.lower()
    if any(part in low for part in ("token", "secret", "password", "private", "seed", "api_key")):
        return "secret-like setting is not applied"
    if key == "desk.mode" and text.upper() == "LIVE":
        return "LIVE is not restored from stored settings"
    if key == "desk.broadcast_enabled" and text.lower() in ("1", "true", "yes", "on"):
        return "broadcast cannot be restored from stored settings"
    if key == "desk.owner_chat_id":
        return "owner chat id is not an authenticator"
    if key == "desk.owner_wallet":
        return "owner wallet comes from the environment, not the database"
    if key in ("desk.host", "desk.bind", "DESK_HOST") and text in ("0.0.0.0", "::", ""):
        return "public bind is not restored from stored settings"
    if key == "desk.rpc_url":
        ok, why = validate_rpc_url(text)
        if not ok:
            return why
    return None


def replacement(key: str):
    if key == "desk.mode":
        return SAFE_MODE
    if key == "desk.broadcast_enabled":
        return False
    if key == "desk.owner_chat_id":
        return 0
    if key in ("desk.host", "desk.bind", "DESK_HOST"):
        return "127.0.0.1"
    if key == "desk.rpc_url":
        return SAFE_RPC
    return None


def quarantine(db, rows: dict, fail_after: str | None = None) -> dict:
    """Apply safe replacements in one transaction. Historical values stay in quarantine."""
    safe = dict(rows)
    con = db._conn
    con.execute("BEGIN")
    try:
        for key, value in list(rows.items()):
            why = reason_for(key, value)
            if not why:
                continue
            encoded = json.dumps(value)
            exists = con.execute(
                "SELECT 1 FROM settings_quarantine WHERE key=? AND value=? LIMIT 1",
                (key, encoded),
            ).fetchone()
            if not exists:
                con.execute(
                    "INSERT INTO settings_quarantine(key,value,reason,quarantined_at) VALUES(?,?,?,?)",
                    (key, encoded, why, "quarantine"),
                )
            if fail_after == key:
                raise RuntimeError("injected migration failure")
            repl = replacement(key)
            blob = json.dumps(repl) if repl is not None else None
            if repl is not None:
                con.execute(
                    "INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                    (key, blob, "quarantine"),
                )
                safe[key] = repl
            else:
                con.execute("DELETE FROM settings WHERE key=?", (key,))
                safe.pop(key, None)
        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK")
        raise
    return safe
