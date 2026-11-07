"""Plan B: write pollable JSON under web/d/{DATA_PATH}/ (secret path, no listing)."""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

import config
from links import SIGNUP_URL, coin_url, profile_url

ROOT = Path(__file__).resolve().parent


class PlanBWriter:
    def __init__(self, db, bus):
        self.db = db
        self.bus = bus
        self.data_path = os.environ.get("DATA_PATH", "")
        self.root = ROOT / "web" / "d" / self.data_path if self.data_path else None

    def enabled(self) -> bool:
        return bool(self.data_path)

    def ensure(self):
        # Unauthenticated Plan B export is disabled. Files are not created or mounted.
        return
        if not self.root:
            return
        self.root.mkdir(parents=True, exist_ok=True)
        # no listing: empty index that 404s conceptually — write a stub
        (self.root / ".keep").write_text("")
        # parent /d/ should not list secrets — put empty deny
        dparent = ROOT / "web" / "d"
        dparent.mkdir(exist_ok=True)
        (dparent / "index.html").write_text("Not found\n")

    async def run(self):
        return
        if not self.enabled():
            return
        self.ensure()
        while True:
            try:
                await self.write_all()
            except Exception:
                pass
            await asyncio.sleep(15)

    async def write_all(self):
        from api import _agent_cards, _ohlc, _range_since

        bal = self.db.latest_balance() or float(config.get("desk.paper_start_stack"))
        start = float(config.get("desk.paper_start_stack"))
        pct = ((bal / start) - 1) * 100 if start else 0
        state = {
            "balance": round(bal, 2),
            "todayPct": round(pct, 2),
            "multiplier": round(bal / start, 2) if start else 1,
            "mode": config.get("desk.mode"),
            "agents": _agent_cards(self.db),
            "paused": config.paused_agents(),
            "ts": config.now_iso(),
        }
        self._w("state.json", state)
        points = self.db.balances(since=_range_since("LIVE"))
        self._w(
            "chart.json",
            {
                "range": "LIVE",
                "points": [{"ts": p["ts"], "value": p["value"]} for p in points],
                "marks": [],
            },
        )
        rows = self.db.activity(limit=30)
        self._w(
            "activity.json",
            {
                "rows": [
                    {
                        "id": r["id"],
                        "ts": r["ts"],
                        "kind": r["kind"],
                        "mint": r["mint"],
                        "agent": r["agent"],
                        "title": r["title"],
                        "subtitle": r["subtitle"],
                        "value": r["value"],
                        "coin_url": coin_url(r["mint"]) if r.get("mint") else None,
                    }
                    for r in rows
                ]
            },
        )
        handle = config.get("desk.pump_handle") or ""
        self._w(
            "account.json",
            {
                "mode": config.get("desk.mode"),
                "stack": config.current_stack(),
                "profile_url": profile_url(handle),
                "pump_handle": handle,
                "signup_url": SIGNUP_URL,
                "invite_url": SIGNUP_URL,
                "telegram": True,
                "plan": "B",
            },
        )
        # coins touched
        coin_dir = self.root / "coin"
        coin_dir.mkdir(exist_ok=True)
        mints = set()
        for r in rows:
            if r.get("mint"):
                mints.add(r["mint"])
        for p in self.db.open_positions():
            mints.add(p["mint"])
        for mint in list(mints)[:50]:
            c = self.db.get_coin(mint) or {"mint": mint}
            prices = self.db.prices(mint)
            pos = self.db.get_position(mint)
            self._w(
                f"coin/{mint}.json",
                {
                    "mint": mint,
                    "name": c.get("name"),
                    "symbol": c.get("symbol"),
                    "price": prices[-1]["price"] if prices else None,
                    "candles": _ohlc(prices),
                    "position": pos,
                    "coin_url": coin_url(mint),
                    "holders": c.get("holders"),
                },
            )

    def _w(self, rel: str, obj):
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(obj, default=str))
        tmp.replace(path)
