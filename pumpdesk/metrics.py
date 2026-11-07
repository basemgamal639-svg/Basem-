"""In-process counters. No labels that carry secrets or raw mints."""
from __future__ import annotations

from threading import Lock


class Metrics:
    def __init__(self):
        self._lock = Lock()
        self._counts: dict[str, int] = {}

    def inc(self, name: str, n: int = 1) -> None:
        with self._lock:
            self._counts[name] = self._counts.get(name, 0) + n

    def snapshot(self) -> dict[str, int]:
        with self._lock:
            return dict(self._counts)


METRICS = Metrics()
