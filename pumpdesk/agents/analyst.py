"""Analyst: rules mode only (no Jev). Same GATE."""
from __future__ import annotations

import asyncio
import hashlib
import logging
from pathlib import Path

import httpx

import config
from fields import dexscreener_pumpswap_pair, dig

log = logging.getLogger("analyst")


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def apply_gate(answers: dict, settings_get=config.get) -> tuple[bool, int, list[str]]:
    alive = float(answers["alive_6h"])
    organic = float(answers["organic"])
    flush = float(answers["flush"])
    chase = float(answers["chase"])
    failed = []
    if alive < float(settings_get("analyst.min_alive_6h")):
        failed.append(f"alive_6h {alive:.2f}")
    if organic < float(settings_get("analyst.min_organic")):
        failed.append(f"organic {organic:.2f}")
    if chase > float(settings_get("analyst.max_chase")):
        failed.append(f"chase {chase:.2f}")
    score = round(100 * (alive + organic + flush + (1 - chase)) / 4)
    if score < int(settings_get("analyst.min_score")):
        failed.append(f"score {score}")
    return (len(failed) == 0), score, failed


def rules_answers(dex: dict, bundled_count: int = 0) -> dict:
    vol_h1 = float(dig(dex, "volume.h1") or 0)
    buys_h1 = float(dig(dex, "txns.h1.buys") or 0)
    buys_m5 = float(dig(dex, "txns.m5.buys") or 0)
    sells_m5 = float(dig(dex, "txns.m5.sells") or 0)
    pc_m5 = float(dig(dex, "priceChange.m5") or 0)
    pc_h1 = float(dig(dex, "priceChange.h1") or 0)

    alive = clamp(vol_h1 / float(config.get("analyst.alive_volume_h1")))
    organic = clamp(buys_h1 / float(config.get("analyst.organic_buys_h1")))
    if bundled_count >= int(config.get("analyst.bundled_penalty_from") or 3):
        organic = clamp(organic * float(config.get("analyst.bundled_penalty")))
    drop = float(config.get("analyst.flush_drop_m5_pct"))
    if pc_m5 <= -drop and buys_m5 >= sells_m5:
        flush = 1.0
    elif pc_m5 < 0:
        flush = 0.5
    else:
        flush = 0.0
    chase = clamp(pc_h1 / float(config.get("analyst.chase_h1_pct")))
    return {
        "alive_6h": alive,
        "organic": organic,
        "flush": flush,
        "chase": chase,
    }


class Analyst:
    def __init__(self, db, bus, notifier=None):
        self.db = db
        self.bus = bus
        self.notifier = notifier
        self.client = httpx.AsyncClient(timeout=30.0)
        self._done: set[str] = set()

    async def run(self):
        while True:
            try:
                item = await self.bus.analyst.get()
                if config.is_paused("analyst"):
                    await self.bus.analyst.put(item)
                    await asyncio.sleep(1)
                    continue
                await self._score(item)
                self.db.heartbeat("analyst")
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("analyst loop")
                await asyncio.sleep(1)

    async def _dex(self, mint: str) -> dict | None:
        url = f"https://api.dexscreener.com/tokens/v1/solana/{mint}"
        try:
            r = await self.client.get(url)
            if r.status_code != 200:
                return None
            data = r.json()
            pairs = data if isinstance(data, list) else []
            return dexscreener_pumpswap_pair(pairs)
        except Exception:
            log.exception("analyst dex")
            return None

    async def _score(self, audit: dict):
        mint = audit["mint"]
        if mint in self._done:
            return
        mode = str(config.get("analyst.mode") or "rules").lower()
        if mode != "rules":
            # Never silently pretend Jev works
            out = {
                "agent": "analyst",
                "mint": mint,
                "answers": {},
                "score": 0,
                "passed": False,
                "failed": ["no answer"],
                "model": "jev-disabled",
                "inputTokens": 0,
                "ts": config.now_iso(),
            }
            self.db.add_verdict(out)
            self._reject(audit, "no answer")
            return

        dex = await self._dex(mint)
        if not dex:
            out = {
                "agent": "analyst",
                "mint": mint,
                "answers": {},
                "score": 0,
                "passed": False,
                "failed": ["no answer"],
                "model": "rules",
                "inputTokens": 0,
                "ts": config.now_iso(),
            }
            self.db.add_verdict(out)
            self._reject(audit, "no answer")
            return

        bundled = 0
        for layer in audit.get("layers") or []:
            if layer.get("n") == 7 and layer.get("pass"):
                val = str(layer.get("value") or "")
                if val.isdigit():
                    bundled = int(val)
        answers = rules_answers(dex, bundled)
        passed, score, failed = apply_gate(answers)
        out = {
            "agent": "analyst",
            "mint": mint,
            "answers": answers,
            "score": score,
            "passed": passed,
            "failed": failed,
            "model": "rules",
            "inputTokens": 0,
            "ts": config.now_iso(),
            "name": audit.get("name"),
            "symbol": audit.get("symbol"),
            "pool": audit.get("pool") or dig(dex, "pairAddress"),
            "audit": audit,
            "dex": {
                "priceUsd": dig(dex, "priceUsd"),
                "liquidityUsd": dig(dex, "liquidity.usd"),
                "marketCap": dig(dex, "marketCap"),
            },
            "scanner": audit.get("scanner") or {},
        }
        state = f"{mint}:{answers}"
        sh = hashlib.sha256(state.encode()).hexdigest()[:12]
        self._log(mint, sh, answers, score, passed)
        self.db.add_verdict(out)
        await self.bus.publish_sse("verdict", out)
        self._done.add(mint)
        if passed:
            await self.bus.executor.put(out)
        else:
            rule = failed[0] if failed else "gate"
            self._reject(audit, rule)

    def _reject(self, audit, rule):
        mint = audit["mint"]
        name = audit.get("name") or mint[:8]
        self.db.add_activity(
            "rejected",
            mint,
            "analyst",
            f"Rejected {name}",
            f"Analyst (rules) · {rule}",
            "Skipped",
        )
        night = config.now_iso()[:10]
        self.db.mark_rejected(mint, night, "analyst")

    def _log(self, mint, sh, answers, score, passed):
        line = (
            f"{config.now_iso()} {mint} hash={sh} "
            f"{answers} score={score} passed={passed} tokens=0"
        )
        log.info(line)
        path = Path(__file__).resolve().parent.parent / "logs" / "analyst.log"
        with path.open("a") as f:
            f.write(line + "\n")
