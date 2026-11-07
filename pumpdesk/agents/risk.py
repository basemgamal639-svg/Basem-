"""Risk: exits. Never places orders — Sell on Pump.fun button only."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

import httpx

import config
from fees import round_trip_fees
from fields import dexscreener_pumpswap_pair, dig
from links import coin_url

log = logging.getLogger("risk")


def evaluate(entry, peak, price, trail_active, opened_at, stop_pct, trail_start, trail_pct, timeout_h, timeout_min_gain, now=None):
    """Pure rules. Returns (new_peak, trail_active, action, reason)."""
    now = now or datetime.now(timezone.utc)
    peak = max(peak, price)
    stop_line = entry * (1 - stop_pct / 100.0)
    if price <= stop_line:
        return peak, trail_active, "exit", "stop"
    if price >= entry * (1 + trail_start / 100.0):
        trail_active = True
    trail_line = peak * (1 - trail_pct / 100.0) if trail_active else None
    if trail_active and price <= trail_line:
        return peak, trail_active, "exit", "trail"
    try:
        opened = datetime.fromisoformat(str(opened_at).replace("Z", "+00:00"))
        hours = (now - opened).total_seconds() / 3600.0
    except Exception:
        hours = 0
    if hours >= timeout_h and price < entry * (1 + timeout_min_gain / 100.0):
        return peak, trail_active, "exit", "timeout"
    return peak, trail_active, "hold", None


class Risk:
    def __init__(self, db, bus, notifier):
        self.db = db
        self.bus = bus
        self.notifier = notifier
        self.client = httpx.AsyncClient(timeout=30.0)
        self._no_price: dict[int, int] = {}
        self._exiting_deadline: dict[int, float] = {}

    async def run(self):
        asyncio.create_task(self._bus_listener())
        while True:
            try:
                if not config.is_paused("risk"):
                    await self._poll()
                    self.db.heartbeat("risk")
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("risk poll")
            await asyncio.sleep(float(config.get("risk.poll_s") or 15))

    async def _bus_listener(self):
        while True:
            try:
                await self.bus.risk.get()
                # wake — next poll handles
            except asyncio.CancelledError:
                raise
            except Exception:
                await asyncio.sleep(1)

    async def _poll(self):
        positions = self.db.open_positions()
        if not positions:
            return
        mints = [p["mint"] for p in positions]
        pairs_by = await self._dex_many(mints)
        for p in positions:
            mint = p["mint"]
            pair = pairs_by.get(mint)
            if not pair:
                n = self._no_price.get(p["id"], 0) + 1
                self._no_price[p["id"]] = n
                if n >= 4:
                    await self.notifier.sell_push(
                        f"{p.get('name') or mint[:8]}: no price for 1 min",
                        mint,
                    )
                    self._no_price[p["id"]] = 0
                continue
            self._no_price[p["id"]] = 0
            price = float(dig(pair, "priceUsd") or 0)
            liq = float(dig(pair, "liquidity.usd") or 0)
            vol = dig(pair, "volume.m5")
            if price > 0:
                self.db.add_price(mint, price, float(vol) if vol is not None else None)
            if liq <= 0 and price > 0:
                await self._exit(p, price, "pulled")
                continue
            if p.get("status") == "exiting":
                continue

            stop_pct = float(p.get("stop_pct") or config.get("risk.stop_pct"))
            # never move stop down (wider): only tighten
            setting_stop = float(config.get("risk.stop_pct"))
            if setting_stop < stop_pct:
                stop_pct = setting_stop
                new_stop = float(p["entry_price"]) * (1 - stop_pct / 100.0)
                self.db.update_position(p["id"], stop_pct=stop_pct, stop_price=new_stop)
                p["stop_pct"] = stop_pct
                p["stop_price"] = new_stop

            peak, trail_active, action, reason = evaluate(
                float(p["entry_price"]),
                float(p["peak_price"]),
                price,
                bool(p.get("trail_active")),
                p["opened_at"],
                stop_pct,
                float(config.get("risk.trail_start_pct")),
                float(p.get("trail_pct") or config.get("risk.trail_pct")),
                float(config.get("risk.timeout_h")),
                float(config.get("risk.timeout_min_gain_pct")),
            )
            self.db.update_position(p["id"], peak_price=peak, trail_active=trail_active)
            stop_line = float(p["entry_price"]) * (1 - stop_pct / 100.0)
            trail_line = peak * (1 - float(p.get("trail_pct") or config.get("risk.trail_pct")) / 100.0) if trail_active else None
            self._log(mint, price, peak, stop_line, trail_line, action, reason)
            if action == "exit":
                await self._exit(p, price, reason)

    async def _dex_many(self, mints: list[str]) -> dict:
        if not mints:
            return {}
        try:
            r = await self.client.get(
                "https://api.dexscreener.com/tokens/v1/solana/" + ",".join(mints[:30])
            )
            if r.status_code == 429:
                log.warning("dex 429 — backoff 30s")
                await asyncio.sleep(30)
                return {}
            data = r.json()
            pairs = data if isinstance(data, list) else []
            out = {}
            by = {}
            for p in pairs:
                base = dig(p, "baseToken.address")
                if base:
                    by.setdefault(base, []).append(p)
            for m, plist in by.items():
                out[m] = dexscreener_pumpswap_pair(plist)
            return out
        except Exception:
            log.exception("risk dex")
            return {}

    async def _exit(self, pos: dict, price: float, reason: str):
        mint = pos["mint"]
        entry = float(pos["entry_price"])
        size = float(pos["size_usd"])
        peak = max(float(pos["peak_price"]), price)
        pct = ((price / entry) - 1.0) * 100.0 if entry else 0.0
        ref = float(config.get("desk.fees_ref_discount") or 0)
        fees = round_trip_fees(size, ref)
        gross = size * (price / entry - 1.0) if entry else 0.0
        pnl = gross - fees
        stop_pct = float(pos.get("stop_pct") or config.get("risk.stop_pct"))
        name = pos.get("name") or mint[:8]
        mode = pos.get("mode") or config.get("desk.mode")
        link = coin_url(mint, "solana")

        out = {
            "agent": "risk",
            "mint": mint,
            "name": name,
            "ts": config.now_iso(),
            "reason": reason,
            "entryPrice": entry,
            "exitPrice": price,
            "peakPrice": peak,
            "pnlUsd": round(pnl, 2),
            "pct": round(pct, 2),
            "feesUsd": round(fees, 2),
            "stopPct": stop_pct,
            "mode": mode,
            "status": "closed" if mode == "PAPER" else "exiting",
            "link": link,
        }

        if reason == "trail":
            text = f"Sold {name} · +${pnl:.2f} (+{pct:.1f}%)" if pnl >= 0 else f"Sold {name} · ${pnl:.2f} ({pct:.1f}%)"
        elif reason == "stop":
            text = f"{name} hit the -{stop_pct:g}% stop · -${abs(pnl):.2f}"
        elif reason == "timeout":
            text = f"Sell {name}, dead money · {pct:.1f}% in {config.get('risk.timeout_h')}h"
        else:
            text = f"Sell {name} · liquidity pulled"

        await self.notifier.sell_push(text, mint)

        if mode == "PAPER":
            self.db.update_position(
                pos["id"],
                status="closed",
                closed_at=config.now_iso(),
                exit_price=price,
                exit_reason=reason,
                pnl_usd=round(pnl, 2),
                fees_usd=round(fees, 2),
                peak_price=peak,
            )
            bal = self.db.latest_balance() or float(config.get("desk.paper_start_stack"))
            # free size + pnl
            new_bal = bal + pnl
            # size was reserved conceptually; paper balance tracks equity
            # simpler: equity change by pnl only (size stays in balance)
            self.db.add_balance(new_bal)
            config.set_paper_balance(new_bal)
            if reason == "stop":
                self.db.add_activity(
                    "stopped",
                    mint,
                    "risk",
                    f"Stopped {name}",
                    f"Risk · -{stop_pct:g}% stop",
                    f"-${abs(pnl):.2f}",
                )
            else:
                self.db.add_activity(
                    "sold",
                    mint,
                    "risk",
                    f"Sold {name}",
                    f"Risk · {'trailing stop' if reason=='trail' else reason}",
                    f"{'+' if pnl>=0 else ''}${pnl:.2f} · {pct:+.1f}%",
                )
        else:
            self.db.update_position(
                pos["id"],
                status="exiting",
                exit_price=price,
                exit_reason=reason,
                pnl_usd=round(pnl, 2),
                fees_usd=round(fees, 2),
                peak_price=peak,
            )
            self._exiting_deadline[pos["id"]] = (
                asyncio.get_event_loop().time()
                + float(config.get("risk.confirm_window_min")) * 60
            )

        await self.bus.publish_sse("exit", out)
        await self.bus.publish_sse("balance", {"value": self.db.latest_balance()})

    async def on_sold(self, mint: str):
        pos = self.db.get_position(mint)
        if not pos:
            return
        self.db.update_position(
            pos["id"],
            status="closed",
            closed_at=config.now_iso(),
        )
        self._exiting_deadline.pop(pos["id"], None)
        name = pos.get("name") or mint[:8]
        pnl = float(pos.get("pnl_usd") or 0)
        self.db.add_activity(
            "sold",
            mint,
            "risk",
            f"Sold {name}",
            "Risk · confirmed",
            f"${pnl:.2f}",
        )

    def _log(self, mint, price, peak, stop, trail, action, reason):
        line = f"{config.now_iso()} {mint} px={price} peak={peak} stop={stop} trail={trail} {action} {reason}"
        log.info(line)
        path = Path(__file__).resolve().parent.parent / "logs" / "risk.log"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a") as f:
            f.write(line + "\n")
