"""In-process asyncio queues between agents + SSE fanout."""
from __future__ import annotations

import asyncio
from typing import Any


class BoundedQueue:
    """Drop-on-full queue so a stalled consumer cannot grow memory without a count."""

    def __init__(self, name: str, maxsize: int = 200):
        self.name = name
        self.maxsize = maxsize
        self._q: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
        self.dropped = 0

    async def put(self, item: Any):
        try:
            self._q.put_nowait(item)
        except asyncio.QueueFull:
            self.dropped += 1

    def get(self):
        return self._q.get()

    def qsize(self) -> int:
        return self._q.qsize()

    def stats(self) -> dict[str, int | str]:
        return {"name": self.name, "depth": self.qsize(), "dropped": self.dropped, "maxsize": self.maxsize}


class Bus:
    def __init__(self, maxsize: int = 200):
        self.auditor = BoundedQueue("auditor", maxsize)
        self.analyst = BoundedQueue("analyst", maxsize)
        self.executor = BoundedQueue("executor", maxsize)
        self.risk = BoundedQueue("risk", maxsize)
        self._sse_subscribers: list[asyncio.Queue] = []
        self._lock = asyncio.Lock()

    def queue_stats(self) -> list[dict]:
        return [q.stats() for q in (self.auditor, self.analyst, self.executor, self.risk)]

    async def publish_sse(self, event: str, data: Any):
        async with self._lock:
            dead = []
            for q in self._sse_subscribers:
                try:
                    q.put_nowait({"event": event, "data": data})
                except Exception:
                    dead.append(q)
            for q in dead:
                if q in self._sse_subscribers:
                    self._sse_subscribers.remove(q)

    async def subscribe_sse(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        async with self._lock:
            self._sse_subscribers.append(q)
        return q

    async def unsubscribe_sse(self, q: asyncio.Queue):
        async with self._lock:
            if q in self._sse_subscribers:
                self._sse_subscribers.remove(q)
