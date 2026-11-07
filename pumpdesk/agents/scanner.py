"""Scanner: PumpPortal migrations → waiting room → kill/pass rules."""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
import websockets

import config
from fields import dexscreener_pumpswap_pair, dig, pumpportal_field

log = logging.getLogger("scanner")
RAW = Path(__file__).resolve().parent.parent / "logs" / "raw"
TOKEN_PROG = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
# pump.fun bonding curve program / known accounts to exclude when possible
PUMP_FUN_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"


def _night() -> str:
    # America/Toronto calendar date
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("America/Toronto")).strftime("%Y-%m-%d")
    except Exception:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _norm_name(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"[\s\d]+", "", s)
    s = re.sub(r"[^\w]+", "", s, flags=re.UNICODE)
    # strip emoji-ish
    s = re.sub(r"[\U00010000-\U0010ffff]", "", s)
    return s


def _fmt_liq(n: float) -> str:
    if n >= 1000:
        return f"${n/1000:.1f}K"
    return f"${n:.0f}"


class Scanner:
    def __init__(self, db, bus, notifier=None):
        self.db = db
        self.bus = bus
        self.notifier = notifier
        self._dex_times: list[float] = []
        self._passed_tonight: set[str] = set()
        self._ws_reconnects = 0
        self._last_msg = time.time()
        self._raw_saved = False
        self.last_ws_frame_at: float | None = None
        self.client = httpx.AsyncClient(timeout=30.0, follow_redirects=False)

    async def run(self):
        await asyncio.gather(self._ws_loop(), self._poll_loop())

    async def _ws_loop(self):
        backoff = 1
        url = "wss://pumpportal.fun/api/data"
        while True:
            if config.is_paused("scanner"):
                await asyncio.sleep(1)
                continue
            try:
                async with websockets.connect(url, ping_interval=20, ping_timeout=20) as ws:
                    await ws.send(json.dumps({"method": "subscribeMigration"}))
                    log.info("PumpPortal subscribedMigration")
                    backoff = 1
                    self._last_msg = time.time()
                    while True:
                        if config.is_paused("scanner"):
                            await asyncio.sleep(1)
                            continue
                        try:
                            silent = float(config.get("scanner.ws_silent_s") or 120)
                            raw = await asyncio.wait_for(ws.recv(), timeout=silent)
                        except asyncio.TimeoutError:
                            log.warning("PumpPortal silent — reconnect")
                            self._ws_reconnects += 1
                            break
                        self._last_msg = time.time()
                        self.last_ws_frame_at = self._last_msg
                        self.db.heartbeat("scanner")
                        try:
                            msg = json.loads(raw)
                        except Exception:
                            continue
                        # subscribe ack has no mint — keep waiting for a real migration
                        if pumpportal_field(msg, "mint") is None and "message" in msg:
                            log.info("PumpPortal: %s", msg.get("message"))
                            continue
                        if not self._raw_saved and pumpportal_field(msg, "mint"):
                            RAW.mkdir(parents=True, exist_ok=True)
                            (RAW / "pumpportal-migration.json").write_text(
                                json.dumps(msg, indent=2)[:200_000]
                            )
                            self._raw_saved = True
                            log.info("saved raw PumpPortal migration sample")
                        await self._on_migration(msg)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("PumpPortal ws error")
                self._ws_reconnects += 1
            log.info("PumpPortal reconnect backoff %ss", backoff)
            await asyncio.sleep(backoff)
            backoff = min(60, backoff * 2)

    async def _on_migration(self, msg: dict):
        mint = pumpportal_field(msg, "mint")
        pool = pumpportal_field(msg, "pool")
        creator = pumpportal_field(msg, "creator")
        if not mint:
            log.warning("migration without mint: keys=%s", list(msg)[:20])
            return
        night = _night()
        if mint in self._passed_tonight:
            return
        # creator balance later via rugcheck/rpc
        self.db.waiting_add(
            mint=mint,
            name=dig(msg, "name") or dig(msg, "symbol"),
            symbol=dig(msg, "symbol"),
            pool=pool,
            migrated_at=config.now_iso(),
            creator=creator,
            creator_balance=None,
            night=night,
        )
        self.db.upsert_coin(
            mint=mint,
            name=dig(msg, "name"),
            symbol=dig(msg, "symbol"),
            pool=pool,
            migrated_at=config.now_iso(),
            creator=creator,
            night=night,
        )
        log.info("waiting room + %s", mint)

    async def _poll_loop(self):
        while True:
            try:
                if not config.is_paused("scanner"):
                    await self._tick()
                    self.db.heartbeat("scanner")
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("scanner poll")
            await asyncio.sleep(float(config.get("scanner.poll_s") or 60))

    async def _rate_ok(self) -> bool:
        now = time.time()
        self._dex_times = [t for t in self._dex_times if now - t < 60]
        return len(self._dex_times) < int(config.get("scanner.dex_max_req_per_min") or 250)

    async def _dex_tokens(self, mints: list[str]) -> list[dict]:
        if not mints:
            return []
        if not await self._rate_ok():
            await asyncio.sleep(1)
        url = "https://api.dexscreener.com/tokens/v1/solana/" + ",".join(mints[:30])
        try:
            self._dex_times.append(time.time())
            r = await self.client.get(url)
            if r.status_code == 429:
                log.warning("DexScreener 429 — wait 30s")
                await asyncio.sleep(30)
                return []
            r.raise_for_status()
            data = r.json()
            if isinstance(data, list):
                return data
            return data.get("pairs") or data if isinstance(data, dict) else []
        except Exception:
            log.exception("dexscreener")
            return []

    async def _rpc(self, method: str, params: list):
        from rpc_allowlist import pin_resolved_host
        rpc = str(config.get("desk.rpc_url") or "")
        ok, _why = pin_resolved_host(rpc)
        if not ok:
            log.warning("rpc refused by allowlist")
            return None
        for attempt in range(3):
            try:
                r = await self.client.post(
                    rpc, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
                )
                if r.status_code == 429:
                    await asyncio.sleep(2 * (attempt + 1))
                    continue
                data = r.json()
                return data.get("result")
            except Exception:
                await asyncio.sleep(2)
        return None

    async def _top10_pct(self, mint: str, pool: str | None) -> float | None:
        result = await self._rpc("getTokenLargestAccounts", [mint])
        if not result:
            return None
        value = dig(result, "value") or result if isinstance(result, list) else dig(result, "value")
        if not isinstance(value, list):
            return None
        supply_res = await self._rpc("getTokenSupply", [mint])
        supply = float(dig(supply_res, "value.uiAmount") or dig(supply_res, "value.amount") or 0)
        if supply <= 0:
            # try amount / decimals
            amt = dig(supply_res, "value.amount")
            dec = dig(supply_res, "value.decimals") or 0
            try:
                supply = float(amt) / (10 ** int(dec))
            except Exception:
                return None
        total = 0.0
        counted = 0
        for acc in value:
            addr = dig(acc, "address")
            if pool and addr == pool:
                continue
            # can't always know curve; skip zero
            ui = dig(acc, "uiAmount")
            try:
                amt = float(ui) if ui is not None else float(dig(acc, "amount") or 0)
            except Exception:
                continue
            total += amt
            counted += 1
            if counted >= 10:
                break
        if supply <= 0:
            return None
        return (total / supply) * 100.0

    async def _tick(self):
        room = self.db.waiting_list(active_only=True)
        if not room:
            return
        mints = [r["mint"] for r in room]
        # batch dex
        pairs_raw = await self._dex_tokens(mints)
        # tokens/v1 returns a flat list of pairs for those mints
        by_mint: dict[str, list] = {}
        if isinstance(pairs_raw, list):
            for p in pairs_raw:
                base = dig(p, "baseToken.address")
                if base:
                    by_mint.setdefault(base, []).append(p)

        night = _night()
        runners = self.db.runners_today(night)
        runner_norms = []
        for r in runners:
            runner_norms.append((_norm_name(r.get("name") or ""), r.get("name") or r.get("symbol") or "?"))
            runner_norms.append((_norm_name(r.get("symbol") or ""), r.get("symbol") or "?"))

        min_liq = float(config.get("scanner.min_liquidity_usd"))
        max_top = float(config.get("scanner.max_top10_pct"))
        max_h1 = float(config.get("scanner.max_h1_change_pct"))
        min_age = int(config.get("scanner.min_pool_age_min"))
        max_wait = int(config.get("scanner.max_wait_min"))
        runner_h24 = float(config.get("scanner.runner_h24_pct"))

        now = datetime.now(timezone.utc)

        for row in room:
            mint = row["mint"]
            if mint in self._passed_tonight:
                continue
            pairs = by_mint.get(mint) or []
            pair = dexscreener_pumpswap_pair(pairs)
            if not pair:
                # wait until DexScreener knows it
                continue
            name = dig(pair, "baseToken.name") or row.get("name") or mint[:6]
            symbol = dig(pair, "baseToken.symbol") or row.get("symbol") or "?"
            pool = dig(pair, "pairAddress") or row.get("pool")
            liq = float(dig(pair, "liquidity.usd") or 0)
            price = float(dig(pair, "priceUsd") or 0)
            vol_m5 = dig(pair, "volume.m5")
            h1 = float(dig(pair, "priceChange.h1") or 0)
            h24 = float(dig(pair, "priceChange.h24") or 0)
            created = dig(pair, "pairCreatedAt")
            # age
            migrated_at = row.get("migrated_at")
            try:
                mig = datetime.fromisoformat(migrated_at.replace("Z", "+00:00"))
            except Exception:
                mig = now
            age_min = int((now - mig).total_seconds() // 60)
            if created:
                try:
                    age_min = max(age_min, int((now.timestamp() * 1000 - int(created)) // 60000))
                except Exception:
                    pass

            if price:
                self.db.add_price(mint, price, float(vol_m5) if vol_m5 is not None else None)

            # track runners
            if h24 >= runner_h24:
                self.db.add_runner(mint, name, symbol, night, h24)

            # fill creator from rugcheck if missing
            creator = row.get("creator")
            if not creator:
                try:
                    rr = await self.client.get(f"https://api.rugcheck.xyz/v1/tokens/{mint}/report")
                    if rr.status_code == 200:
                        rep = rr.json()
                        creator = dig(rep, "creator")
                        cbal = dig(rep, "creatorBalance")
                        if creator:
                            self.db.waiting_update(mint, creator=creator, creator_balance=cbal)
                            self.db.upsert_coin(mint=mint, creator=creator, creator_balance_at_migration=cbal)
                except Exception:
                    pass

            top10 = await self._top10_pct(mint, pool)

            decision = {
                "agent": "scanner",
                "mint": mint,
                "name": name,
                "symbol": symbol,
                "pool": pool,
                "liquidityUsd": liq,
                "top10Pct": top10,
                "h1ChangePct": h1,
                "ageMin": age_min,
                "verdict": "kill",
                "reason": None,
                "ts": config.now_iso(),
            }

            # kill order
            reason = None
            if liq < min_liq:
                reason = f"liq {_fmt_liq(liq)}"
            elif top10 is not None and top10 > max_top:
                reason = f"top 10 hold {top10:.0f}%"
            elif h1 > max_h1:
                reason = f"+{h1:.0f}% in 1h"
            else:
                nn = _norm_name(name)
                ns = _norm_name(symbol)
                for rn, rlabel in runner_norms:
                    if not rn:
                        continue
                    if nn == rn or ns == rn or (nn and rn in nn) or (ns and rn in ns) or (nn and nn in rn):
                        if rlabel.lower() not in (name.lower(), symbol.lower()):
                            reason = f"copycat of {rlabel}"
                            break

            if reason:
                decision["reason"] = reason
                decision["verdict"] = "kill"
                self.db.waiting_update(mint, killed=1, reason=reason)
                self.db.add_scan(decision)
                self._log_decision(decision)
                await self.bus.publish_sse("scan", decision)
                continue

            if age_min >= max_wait and age_min < min_age:
                # shouldn't happen
                pass
            if age_min >= max_wait:
                decision["reason"] = "never qualified"
                decision["verdict"] = "kill"
                self.db.waiting_update(mint, killed=1, reason="never qualified")
                self.db.add_scan(decision)
                self._log_decision(decision)
                await self.bus.publish_sse("scan", decision)
                continue

            if age_min < min_age:
                # still waiting — update liq snapshot
                self.db.waiting_update(
                    mint, scanner_liq=liq, scanner_price=price, name=name, symbol=symbol, pool=pool
                )
                self.db.upsert_coin(mint=mint, name=name, symbol=symbol, pool=pool)
                continue

            # PASS
            decision["verdict"] = "pass"
            decision["reason"] = None
            self._passed_tonight.add(mint)
            self.db.waiting_update(
                mint, passed=1, scanner_liq=liq, scanner_price=price, name=name, symbol=symbol, pool=pool
            )
            self.db.upsert_coin(mint=mint, name=name, symbol=symbol, pool=pool)
            self.db.add_scan(decision)
            self._log_decision(decision)
            await self.bus.publish_sse("scan", decision)
            await self.bus.auditor.put(decision)

    def _log_decision(self, d: dict):
        line = (
            f"{d['ts']} {d['mint']} {d['verdict']} {d.get('reason')} "
            f"liq={d.get('liquidityUsd')} top10={d.get('top10Pct')} h1={d.get('h1ChangePct')} age={d.get('ageMin')}"
        )
        log.info(line)
        path = Path(__file__).resolve().parent.parent / "logs" / "scanner.log"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a") as f:
            f.write(line + "\n")
