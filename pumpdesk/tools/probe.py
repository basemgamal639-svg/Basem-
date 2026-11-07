"""Local watchdog. Talks only to the configured health URLs. Alerts are injected."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ProbeResult:
    live_status: int | None
    ready_status: int | None
    alerted: bool
    detail: str


class ListAlert:
    """Test double. Records messages and does not send anywhere."""

    def __init__(self):
        self.messages: list[str] = []

    def notify(self, text: str) -> None:
        self.messages.append(text)


def run_probe(base_url: str, client, alert) -> ProbeResult:
    """client.get(url) -> object with status_code. No Telegram, no RPC."""
    live = _get(client, base_url.rstrip("/") + "/health/live")
    ready = _get(client, base_url.rstrip("/") + "/health/ready")
    alerted = False
    problems = []
    if live is None or live >= 400:
        problems.append(f"live={live}")
    if ready is None or ready >= 400:
        problems.append(f"ready={ready}")
    if problems:
        alerted = True
        alert.notify("pumpdesk probe " + ", ".join(problems))
    return ProbeResult(live, ready, alerted, "; ".join(problems) or "ok")


def _get(client, url: str) -> int | None:
    try:
        response = client.get(url)
    except Exception:
        return None
    return int(getattr(response, "status_code", 0) or 0)
