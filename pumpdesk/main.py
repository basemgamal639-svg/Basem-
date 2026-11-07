"""ONE always-on asyncio process: agents + FastAPI/uvicorn + Telegram long polling."""
from __future__ import annotations

import asyncio
import logging
import os
import signal
import sys
from pathlib import Path

import uvicorn

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

import config
from api import create_app
from bus import Bus
from db import DB
from notifier import Notifier
from telegram import Telegram
from webpush import WebPush
from agents.scanner import Scanner
from agents.auditor import Auditor
from agents.analyst import Analyst
from agents.executor import Executor
from agents.risk import Risk
from planb import PlanBWriter
from links import SIGNUP_URL, coin_url

LOG_DIR = ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)


def setup_logging():
    from logging_setup import configure_logging
    LOG_DIR.mkdir(exist_ok=True)
    configure_logging()


class Desk:
    def __init__(self):
        config.load_secrets()
        self.db = DB()
        config.init(self.db)
        self.bus = Bus()
        self.webpush = WebPush(self.db)
        self.telegram = Telegram(self.db, self.bus)
        self.notifier = Notifier(telegram=self.telegram, webpush=self.webpush, db=self.db)
        self._lock_handle = None
        self.scanner = Scanner(self.db, self.bus, self.notifier)
        self.auditor = Auditor(self.db, self.bus, self.notifier)
        self.analyst = Analyst(self.db, self.bus, self.notifier)
        self.executor = Executor(self.db, self.bus, self.notifier)
        self.risk = Risk(self.db, self.bus, self.notifier)
        self.planb = PlanBWriter(self.db, self.bus)
        self.telegram.on_callback = self._on_callback
        self.telegram.on_command = self._on_command
        self.planb.ensure()
        self.app = create_app(self.db, self.bus, desk=self)
        self._tasks: list[asyncio.Task] = []
        self._night_id = None

    async def _on_callback(self, data: str, _from: str):
        if data.startswith("bought:") or data.startswith("skip:"):
            await self.executor.on_callback(data)
        elif data.startswith("sold:"):
            mint = data.split(":", 1)[1]
            await self.risk.on_sold(mint)

    async def _on_command(self, cmd: str, arg: str) -> str:
        coins = self.db.find_coins(arg)
        if not coins and len(arg) >= 32:
            coins = [{"mint": arg, "name": arg[:8]}]
        if not coins:
            return f"Unknown coin '{arg}'. Send the mint."
        if len(coins) > 1:
            lines = ["Which one?"]
            for c in coins:
                lines.append(f"{c.get('name') or '?'} ({c.get('symbol')})\n{coin_url(c['mint'])}")
            return "\n".join(lines)
        coin = coins[0]
        mint = coin["mint"]
        link = coin_url(mint)
        if cmd == "buy":
            # resend if signal exists
            sigs = [s for s in self.db.recent_signals(50) if s.get("mint") == mint]
            if sigs:
                await self.notifier.buy_push(
                    coin.get("name") or mint[:8],
                    mint,
                    float(sigs[0].get("size_usd") or 0),
                    float(sigs[0].get("stack_pct") or config.get("executor.stack_pct")),
                    0,
                    float(config.get("risk.stop_pct")),
                    float(config.get("risk.trail_pct")),
                )
                return f"Resent buy push for {coin.get('name')}\n{link}"
            audit = await self.auditor.audit_now(mint)
            layers = audit.get("layers") or []
            lines = [f"Audit {coin.get('name') or mint[:8]} (not sized, not on the desk)"]
            for L in layers:
                mark = "✓" if L.get("pass") and L.get("value") != "not checked" else ("·" if L.get("value") == "not checked" else "✗")
                lines.append(f"{mark} {L.get('n')}. {L.get('name')}: {L.get('value')}")
            lines.append(link)
            await self.notifier.send(
                "\n".join(lines),
                mint=mint,
                buttons=[{"kind": "url", "text": "Buy on Pump.fun", "url": link}],
                paper=True,
            )
            return "\n".join(lines)
        if cmd == "sell":
            pos = self.db.get_position(mint)
            if not pos:
                return f"No open position for {coin.get('name')}\n{link}"
            await self.notifier.sell_push(f"Sell {coin.get('name')}", mint)
            return f"Sell push sent\n{link}"
        if cmd == "why":
            audit = self.db.get_audit(mint)
            if audit and not audit.get("passed"):
                return f"Auditor stopped it · {audit.get('reason')} · {audit.get('ts')}\n{link}"
            verts = [v for v in self.db.recent_verdicts(50) if v.get("mint") == mint]
            if verts and not verts[0].get("passed"):
                failed = (verts[0].get("failed") or ["gate"])[0]
                return f"Analyst (rules) · {failed} · {verts[0].get('ts')}\n{link}"
            scans = [s for s in self.db.recent_scans(50) if s.get("mint") == mint]
            if scans and scans[0].get("verdict") == "kill":
                return f"Scanner · {scans[0].get('reason')} · {scans[0].get('ts')}\n{link}"
            return f"No reject on record for {coin.get('name')}\n{link}"
        return "Unknown command"

    async def _balance_ticker(self):
        # seed paper balance
        if self.db.latest_balance() is None:
            start = float(config.get("desk.paper_start_stack"))
            self.db.add_balance(start)
            config.set_paper_balance(start)
        # ticket check at night start
        tc = config.ticket_check()
        if tc.get("message"):
            await self.notifier.send(tc["message"], paper=True)
        self._night_id = self.db.start_night(str(config.get("desk.mode")))
        self.telegram.night_id = self._night_id
        while True:
            await asyncio.sleep(60)
            bal = self.db.latest_balance()
            if bal is not None:
                self.db.add_balance(bal)
                await self.bus.publish_sse("balance", {"value": bal})
            self.db.heartbeat("main")

    def _acquire_process_lock(self):
        import fcntl
        path = ROOT / "data" / "pumpdesk.lock"
        path.parent.mkdir(parents=True, exist_ok=True)
        handle = path.open("a")
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            handle.close()
            raise SystemExit("another pump desk process holds the lock; refusing a second Telegram poller")
        self._lock_handle = handle

    async def start(self):
        self._acquire_process_lock()
        await self.telegram.start()
        self._tasks = [
            asyncio.create_task(self.scanner.run(), name="scanner"),
            asyncio.create_task(self.auditor.run(), name="auditor"),
            asyncio.create_task(self.analyst.run(), name="analyst"),
            asyncio.create_task(self.executor.run(), name="executor"),
            asyncio.create_task(self.risk.run(), name="risk"),
            asyncio.create_task(self._balance_ticker(), name="balance"),
        ]
        host = os.environ.get("DESK_HOST", "127.0.0.1")
        port = int(os.environ.get("DESK_PORT", "8787"))
        uvi = uvicorn.Server(
            uvicorn.Config(self.app, host=host, port=port, log_level="info", loop="asyncio", access_log=False)
        )
        logging.getLogger("desk").info("serving on http://%s:%s", host, port)
        await uvi.serve()

    async def stop(self):
        if self._night_id:
            # not a "full" night unless ended via report
            self.db.end_night(self._night_id, full=False)
        for t in self._tasks:
            t.cancel()
        await self.telegram.stop()
        if self._lock_handle is not None:
            self._lock_handle.close()
            self._lock_handle = None


def main():
    setup_logging()
    # load env file into os.environ without printing
    env_path = ROOT / ".secrets" / "env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
    desk = Desk()

    def _sig(*_):
        logging.getLogger("desk").info("signal — shutting down")
        asyncio.get_event_loop().create_task(desk.stop())

    try:
        asyncio.run(desk.start())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
