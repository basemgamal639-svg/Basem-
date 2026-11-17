"""Polite HTTP client: identifies itself, honours robots.txt, never retries aggressively."""
from __future__ import annotations
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx

UA = "JobAgentPersonal/1.0 (personal job-search assistant; low-volume)"


class Http:
    def __init__(self, client: httpx.Client | None = None):
        self.client = client or httpx.Client(headers={"User-Agent": UA}, timeout=15, follow_redirects=True)
        self._robots: dict[str, RobotFileParser | None] = {}

    def allowed(self, url: str) -> bool:
        p = urlparse(url)
        base = f"{p.scheme}://{p.netloc}"
        if base not in self._robots:
            rp = RobotFileParser()
            try:
                r = self.client.get(base + "/robots.txt")
                if r.status_code == 200:
                    rp.parse(r.text.splitlines())
                elif r.status_code >= 500:
                    rp.disallow_all = True
                else:
                    rp.allow_all = True
            except httpx.HTTPError:
                rp.allow_all = True
            self._robots[base] = rp
        return self._robots[base].can_fetch(UA, url)

    def get(self, url: str, *, robots: bool = True, **kw) -> httpx.Response | None:
        """Returns None when robots.txt forbids the URL or the request fails."""
        if robots and not self.allowed(url):
            return None
        try:
            return self.client.get(url, **kw)
        except httpx.HTTPError:
            return None
