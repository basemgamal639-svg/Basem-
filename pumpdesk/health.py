"""Health views. GET handlers must not send, write settings, or call the network."""
from __future__ import annotations

from datetime import datetime, timezone
from shutil import disk_usage
from typing import Any

import simpreview


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _age_s(value: str | None, now: datetime) -> float | None:
    parsed = _parse_iso(value)
    if parsed is None:
        return None
    return (now - parsed).total_seconds()


def trading_status(fields: dict[str, Any]) -> str:
    """idle is not ok. A quiet scanner must not look healthy."""
    required = (
        fields.get("pumpportal_socket"),
        fields.get("dex"),
        fields.get("rpc_configured"),
    )
    if any(item == "stale" or item == "down" for item in required):
        return "stale"
    if fields.get("ingestion") != "fresh":
        return "idle"
    if fields.get("evaluation") == "stuck":
        return "stuck"
    return "ok"


def build_health(db, bus, telegram=None, scanner=None, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    stamps = db.pipeline_timestamps()
    heartbeats = db.all_heartbeats()
    queues = bus.queue_stats() if bus is not None else []
    migration_age = _age_s(stamps.get("last_migration_at"), now)
    scan_age = _age_s(stamps.get("last_scan_at"), now)
    audit_age = _age_s(stamps.get("last_audit_at"), now)
    verdict_age = _age_s(stamps.get("last_verdict_at"), now)

    socket_at = getattr(scanner, "last_ws_frame_at", None) if scanner else None
    socket_age = None if socket_at is None else (now.timestamp() - float(socket_at))
    if scanner is None or socket_age is None:
        socket_state = "unknown"
    elif socket_age <= 120:
        socket_state = "fresh"
    else:
        socket_state = "stale"

    if migration_age is None:
        ingestion = "idle"
    elif migration_age <= 3600:
        ingestion = "fresh"
    else:
        ingestion = "idle"

    depth = sum(int(q.get("depth") or 0) for q in queues)
    if depth > 0 and audit_age is not None and audit_age > 300 and verdict_age is not None and verdict_age > 300:
        evaluation = "stuck"
    elif audit_age is None and verdict_age is None:
        evaluation = "idle"
    else:
        evaluation = "idle" if (audit_age or 0) > 3600 and (verdict_age or 0) > 3600 else "fresh"

    poll_at = getattr(telegram, "last_poll_ok_at", None) if telegram else None
    delivery_at = getattr(telegram, "last_delivery_at", None) if telegram else None
    if telegram is None or not getattr(telegram, "token", ""):
        telegram_poll = "disabled"
    elif poll_at is None:
        telegram_poll = "never"
    elif (now.timestamp() - float(poll_at)) <= 90:
        telegram_poll = "fresh"
    else:
        telegram_poll = "stale"
    if delivery_at is None:
        telegram_delivery = "never"
    else:
        telegram_delivery = datetime.fromtimestamp(float(delivery_at), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    data_dir = db.path.parent
    usage = disk_usage(data_dir if data_dir.exists() else data_dir.parent)
    db_bytes = db.path.stat().st_size if db.path.exists() else 0

    fields = {
        "pumpportal_socket": socket_state,
        "dex": "unknown",
        "rpc_configured": "allowlisted",
        "ingestion": ingestion,
        "evaluation": evaluation,
    }
    # dex freshness follows the last stored scan, which is written only after a Dex read.
    if scan_age is None:
        fields["dex"] = "unknown"
    elif scan_age <= 180:
        fields["dex"] = "fresh"
    else:
        fields["dex"] = "stale"

    return {
        "trading_status": trading_status(fields),
        "note": "idle means no recent ingest. HTTP 200 on this route is not trading health.",
        "ingestion": ingestion,
        "last_migration_at": stamps.get("last_migration_at"),
        "last_scan_at": stamps.get("last_scan_at"),
        "last_audit_at": stamps.get("last_audit_at"),
        "last_verdict_at": stamps.get("last_verdict_at"),
        "last_signal_at": stamps.get("last_signal_at"),
        "pumpportal_socket": socket_state,
        "dex": fields["dex"],
        "evaluation": evaluation,
        "telegram_poll": telegram_poll,
        "telegram_last_delivery": telegram_delivery,
        "queues": queues,
        "heartbeats": heartbeats,
        "disk_free_bytes": usage.free,
        "db_bytes": db_bytes,
        "broadcast_enabled": simpreview.BROADCAST_ENABLED,
        "simulated_only": True,
    }
