"""Reject insecure bind and secret-directory modes. Does not chmod or edit config."""
from __future__ import annotations

import os
import stat
from pathlib import Path


def bind_rejected(host: str) -> str | None:
    text = (host or "").strip().lower()
    if text in ("", "0.0.0.0", "::", "::0"):
        return "refusing a public or empty bind; set DESK_HOST to 127.0.0.1"
    return None


def secrets_dir_rejected(path: Path) -> str | None:
    if not path.exists():
        return None
    mode = path.stat().st_mode
    if mode & (stat.S_IRWXO | stat.S_IRWXG):
        return "secrets directory is group or world accessible; tighten it before start"
    return None


def assert_runtime(host: str, secrets_dir: Path | None = None) -> None:
    reason = bind_rejected(host)
    if reason:
        raise SystemExit(reason)
    if secrets_dir is not None:
        reason = secrets_dir_rejected(secrets_dir)
        if reason:
            raise SystemExit(reason)


def host_from_env() -> str:
    return os.environ.get("DESK_HOST", "127.0.0.1")
