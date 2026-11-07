"""JSON logs. Known secret field names are redacted."""
from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone

_REDACT_KEYS = {
    "token",
    "app_token",
    "tg_token",
    "authorization",
    "vapid_private_key",
    "private_key",
    "secret",
    "password",
    "seed",
    "mnemonic",
    "signature",
    "auth",
    "p256dh",
}


def redact(value):
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            if str(key).lower() in _REDACT_KEYS:
                out[key] = "[redacted]"
            else:
                out[key] = redact(item)
        return out
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(redact(payload), default=str)


def configure_logging(level: int = logging.INFO) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
