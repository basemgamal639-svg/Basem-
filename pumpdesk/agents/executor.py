"""Executor: size arithmetic + Buy on Pump.fun push. Never places orders."""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import httpx

import config
from fields import dexscreener_pumpswap_pair, dig
from links import coin_url

log = logging.getLogger("executor")


def compute_size(stack: float, free: float, liq: float, settings_get=config.get) -> tuple[float, str | None, str]:
    """Return (size, skip_reason, cap_note)."""
    stack_pct = float(settings_get("executor.stack_pct"))
    max_pool_pct = float(settings_get("executor.max_pool_pct"))
    min_ticket = float(settings_get("executor.min_ticket_usd"))
    below = str(settings_get("executor.below_min") or "bump")

    raw = stack * (stack_pct / 100.0)
    pool_cap = liq * (max_pool_pct / 100.0) if liq else raw
    size = min(raw, pool_cap)
    cap_note = "pool" if size == pool_cap and pool_cap < raw else "stack"
    if size < min_ticket:
        if below == "bump":
            if free >= min_ticket:
                size = min_ticket
                cap_note = "bump"
            else:
                return 0.0, "under $47.50", cap_note
        else:
            return 0.0, "under $47.50", cap_note
    if size > free:
        return 0.0, "no free stack", cap_note
    size = round(size, 2)
    return size, None, cap_note


class Executor:
    def __init__(self, db, bus, notifier):
        self.db = db
        self.bus = bus
        self.notifier = notifier
        self.client = httpx.AsyncClient(timeout=30.0)
        self._pushed: set[str] = set()
        self._pending_live: dict[str, dict] = {}

    async def run(self):
        asyncio.create_task(self._miss_watcher())
        while True:
            try:
                item = await self.bus.executor.get()
                if config.is_paused("executor"):
                    await self.bus.executor.put(item)
                    await asyncio.sleep(1)
                    continue
                await self._handle(item)
                self.db.heartbeat("executor")
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("executor loop")
                await asyncio.sleep(1)

    async def _dex(self, mint: str):
        try:
            r = await self.client.get(f"https://api.dexscreener.com/tokens/v1/solana/{mint}")
            if r.status_code != 200:
                return None
            data = r.json()
            pairs = data if isinstance(data, list) else []
            return dexscreener_pumpswap_pair(pairs)
        except Exception:
            return None

    async def _handle(self, verdict: dict):
        mint = verdict["mint"]
        if mint in self._pushed:
            return
        if self.db.get_position(mint):
            return
        if self.db.is_skipped(mint):
            return

        dex = await self._dex(mint)
        if not dex:
            self._emit(mint, verdict, 0, 0, None, "skipped", "no price")
            return
        price = float(dig(dex, "priceUsd") or 0)
        liq = float(dig(dex, "liquidity.usd") or 0)
        if price <= 0:
            self._emit(mint, verdict, 0, 0, None, "skipped", "no price")
            return

        # re-check
        scan = verdict.get("scanner") or (verdict.get("audit") or {}).get("scanner") or {}
        scan_liq = float(scan.get("liquidityUsd") or liq)
        drop_pct = float(config.get("executor.recheck_liq_drop_pct"))
        if scan_liq > 0 and liq < scan_liq * (1 - drop_pct / 100.0):
            self._emit(mint, verdict, price, 0, coin_url(mint), "skipped", "liquidity dropping")
            return
        analyst_price = float((verdict.get("dex") or {}).get("priceUsd") or price)
        up_pct = float(config.get("executor.recheck_price_up_pct"))
        if analyst_price > 0 and price > analyst_price * (1 + up_pct / 100.0):
            self._emit(mint, verdict, price, 0, coin_url(mint), "skipped", "ran before the push")
            return

        mode = str(config.get("desk.mode") or "PAPER").upper()
        if mode == "PAPER":
            bal = self.db.latest_balance()
            if bal is None:
                bal = float(config.get("desk.paper_start_stack"))
                self.db.add_balance(bal)
                config.set_paper_balance(bal)
            stack = bal
        else:
            stack = float(config.get("desk.live_stack") or 0)
        free = stack - self.db.money_in_open()
        size, skip, cap = compute_size(stack, free, liq)
        stack_pct = float(config.get("executor.stack_pct"))
        link = coin_url(mint, "solana")
        name = verdict.get("name") or mint[:8]
        score = verdict.get("score") or 0
        stop_pct = float(config.get("risk.stop_pct"))
        trail_pct = float(config.get("risk.trail_pct"))

        self._log(mint, stack, size, cap, mode, skip)

        if mode == "LIVE":
            self._emit(
                mint, verdict, price, size, link, "skipped",
                "live path disabled: unverified fills are refused",
                name=name,
            )
            return

        if skip:
            self._emit(mint, verdict, price, size, link, "skipped", skip, name=name)
            self.db.skip(mint, "morning")
            return

        # push
        self._pushed.add(mint)
        push_ok = True
        try:
            await self.notifier.buy_push(name, mint, size, stack_pct, score, stop_pct, trail_pct)
        except Exception:
            log.exception("push failed")
            push_ok = False

        out = {
            "agent": "executor",
            "mint": mint,
            "signalPrice": price,
            "sizeUsd": size,
            "stackPct": stack_pct,
            "link": link,
            "mode": mode,
            "status": "sent",
            "reason": None if push_ok else "push failed",
            "name": name,
            "symbol": verdict.get("symbol"),
            "ts": config.now_iso(),
            "stop_pct": stop_pct,
            "trail_pct": trail_pct,
        }
        self.db.add_signal(out)
        await self.bus.publish_sse("signal", out)

        if mode == "PAPER":
            # PAPER still records a simulated fill at the signal price.
            await self._fill(out)
        else:
            self.db.update_signal(mint, "skipped", "live path disabled: unverified fills are refused")

    async def _fill(self, sig: dict):
        if str(sig.get("mode") or "").upper() == "LIVE":
            self.db.update_signal(sig["mint"], "skipped", "live path disabled")
            return
        mint = sig["mint"]
        stop_pct = float(sig.get("stop_pct") or config.get("risk.stop_pct"))
        trail_pct = float(sig.get("trail_pct") or config.get("risk.trail_pct"))
        entry = float(sig["signalPrice"])
        size = float(sig["sizeUsd"])
        stop_price = entry * (1 - stop_pct / 100.0)
        pos = {
            "mint": mint,
            "name": sig.get("name"),
            "symbol": sig.get("symbol"),
            "opened_at": config.now_iso(),
            "entry_price": entry,
            "size_usd": size,
            "peak_price": entry,
            "stop_price": stop_price,
            "stop_pct": stop_pct,
            "trail_active": False,
            "trail_pct": trail_pct,
            "mode": sig["mode"],
            "status": "open",
        }
        self.db.add_position(pos)
        self.db.update_signal(mint, "bought")
        pct = float(sig.get("stackPct") or config.get("executor.stack_pct"))
        self.db.add_activity(
            "bought",
            mint,
            "executor",
            f"Bought {sig.get('name') or mint[:8]}",
            f"Executor · {config.now_iso()[11:16]}",
            f"${size:.2f} · {pct:g}% of stack",
        )
        await self.bus.publish_sse("fill", {**sig, "status": "bought"})
        await self.bus.risk.put({"type": "opened", "mint": mint})

    async def on_callback(self, data: str):
        if data.startswith("bought:"):
            mint = data.split(":", 1)[1]
            pending = self._pending_live.pop(mint, None)
            if pending:
                await self._fill(pending)
        elif data.startswith("skip:"):
            mint = data.split(":", 1)[1]
            self._pending_live.pop(mint, None)
            self.db.update_signal(mint, "skipped", "user skip")
            self.db.skip(mint, "morning")

    async def _miss_watcher(self):
        while True:
            await asyncio.sleep(5)
            now = asyncio.get_event_loop().time()
            for mint, p in list(self._pending_live.items()):
                if now >= p["deadline"]:
                    self._pending_live.pop(mint, None)
                    self.db.update_signal(mint, "missed", "no tap")
                    await self.bus.publish_sse("signal", {**p, "status": "missed"})

    def _emit(self, mint, verdict, price, size, link, status, reason, name=None):
        out = {
            "agent": "executor",
            "mint": mint,
            "signalPrice": price,
            "sizeUsd": size,
            "stackPct": float(config.get("executor.stack_pct")),
            "link": link or coin_url(mint),
            "mode": str(config.get("desk.mode")).upper(),
            "status": status,
            "reason": reason,
            "name": name or verdict.get("name"),
            "ts": config.now_iso(),
        }
        self.db.add_signal(out)
        if status == "skipped":
            self.db.skip(mint, "morning")

    def _log(self, mint, stack, size, cap, mode, skip):
        line = f"{config.now_iso()} {mint} stack={stack} size={size} cap={cap} mode={mode} skip={skip}"
        log.info(line)
        path = Path(__file__).resolve().parent.parent / "logs" / "executor.log"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a") as f:
            f.write(line + "\n")
