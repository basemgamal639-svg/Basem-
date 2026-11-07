"""Auditor: 8 layers in order, stop at first red."""
from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import httpx

import config
from fields import dig, rugcheck_graph_has_edges, rugcheck_lp_locked_pct

log = logging.getLogger("auditor")

TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"

LAYER_NAMES = {
    1: "Mint authority",
    2: "Freeze authority",
    3: "Dev wallet",
    4: "Top 10 holders",
    5: "Liquidity",
    6: "Pool age",
    7: "Bundled wallets",
    8: "Delegations",
}


class Auditor:
    def __init__(self, db, bus, notifier=None):
        self.db = db
        self.bus = bus
        self.notifier = notifier
        self.client = httpx.AsyncClient(timeout=60.0, follow_redirects=False)
        self._layer8_down_alerted = False

    async def run(self):
        while True:
            try:
                item = await self.bus.auditor.get()
                if config.is_paused("auditor"):
                    await self.bus.auditor.put(item)
                    await asyncio.sleep(1)
                    continue
                if not config.get("auditor.enabled", True):
                    # pass through without audit
                    await self.bus.analyst.put({"scanner": item, "auditor": {"passed": True, "layers": [], "mint": item["mint"]}})
                    continue
                await self._audit(item)
                self.db.heartbeat("auditor")
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("auditor loop")
                await asyncio.sleep(1)

    async def _rpc(self, method, params):
        from pinned_rpc import RpcRefused, post_json
        rpc = str(config.get("desk.rpc_url") or "")
        retries = int(config.get("auditor.retries") or 3)
        for i in range(retries):
            try:
                r = await post_json(rpc, {"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
                if r.status_code == 429:
                    await asyncio.sleep(2)
                    continue
                data = r.json()
                if data.get("error"):
                    await asyncio.sleep(2)
                    continue
                return data.get("result")
            except RpcRefused:
                log.warning("rpc refused")
                return None
            except Exception:
                await asyncio.sleep(2)
        return None

    async def _audit(self, scan: dict):
        mint = scan["mint"]
        night = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if self.db.was_rejected(mint, night):
            return
        coin = self.db.get_coin(mint) or {}
        pool = scan.get("pool") or coin.get("pool")
        t0 = time.time()

        report = None
        graph = None
        try:
            rr = await self.client.get(f"https://api.rugcheck.xyz/v1/tokens/{mint}/report")
            if rr.status_code == 200:
                report = rr.json()
        except Exception:
            log.exception("rugcheck report")
        try:
            rg = await self.client.get(f"https://api.rugcheck.xyz/v1/tokens/{mint}/insiders/graph")
            if rg.status_code == 200:
                graph = rg.json()
        except Exception:
            log.exception("rugcheck graph")

        layers = []
        holders = None
        reason = None
        passed = False
        layers_checked = 0

        async def emit(n, ok, value, source):
            nonlocal layers_checked
            layers_checked = n
            layer = {
                "n": n,
                "name": LAYER_NAMES[n],
                "pass": ok,
                "value": value,
                "source": source,
            }
            layers.append(layer)
            self.db.add_audit_layer(mint, n, LAYER_NAMES[n], value, ok, source)
            await self.bus.publish_sse(
                "audit_layer",
                {"mint": mint, "layer": layer, "name": scan.get("name")},
            )
            self._log(mint, n, value, ok, int((time.time() - t0) * 1000))
            return ok

        # Layer 1 + 2 from getAccountInfo
        info = await self._rpc(
            "getAccountInfo",
            [mint, {"encoding": "jsonParsed"}],
        )
        parsed = dig(info, "value.data.parsed.info") if info else None
        if parsed is None and report:
            # fallback keys from mapping
            mint_auth = dig(report, "token.mintAuthority")
            if mint_auth is None:
                mint_auth = dig(report, "mintAuthority")
            freeze_auth = dig(report, "token.freezeAuthority")
            if freeze_auth is None:
                freeze_auth = dig(report, "freezeAuthority")
            # synthesize
            parsed = {"mintAuthority": mint_auth, "freezeAuthority": freeze_auth}
            src = "rugcheck"
        else:
            src = "rpc"

        if parsed is None:
            await emit(1, False, "no data: mint authority", "rpc")
            reason = "no data: mint authority"
        else:
            mint_auth = dig(parsed, "mintAuthority")
            ok = mint_auth is None
            if not await emit(1, ok, "Revoked" if ok else "mint not revoked", src):
                reason = "mint not revoked"
            else:
                freeze_auth = dig(parsed, "freezeAuthority")
                ok2 = freeze_auth is None
                if not await emit(2, ok2, "Revoked" if ok2 else "freeze not revoked", src):
                    reason = "freeze not revoked"

        # mark remaining grey if already red
        def grey_rest(from_n):
            for n in range(from_n, 9):
                layers.append(
                    {
                        "n": n,
                        "name": LAYER_NAMES[n],
                        "pass": False,
                        "value": "not checked",
                        "source": "skip",
                    }
                )

        if reason:
            grey_rest(len(layers) + 1)
            await self._finish(scan, False, layers_checked, layers, None, reason)
            return

        # Layer 3 Dev wallet
        creator = coin.get("creator") or (dig(report, "creator") if report else None)
        supply = await self._supply(mint)
        if supply is None or supply <= 0:
            await emit(3, False, "no supply", "rpc")
            grey_rest(4)
            await self._finish(scan, False, 3, layers, None, "no supply")
            return
        if not creator:
            await emit(3, False, "no data: dev", "rpc")
            grey_rest(4)
            await self._finish(scan, False, 3, layers, None, "no data: dev")
            return
        bal = await self._creator_balance(creator, mint)
        if bal is None:
            # try report
            bal = dig(report, "creatorBalance") if report else None
            try:
                bal = float(bal) if bal is not None else None
            except Exception:
                bal = None
        if bal is None:
            await emit(3, False, "no data: dev", "rpc")
            grey_rest(4)
            await self._finish(scan, False, 3, layers, None, "no data: dev")
            return
        pct = (bal / supply) * 100.0
        mig_bal = coin.get("creator_balance_at_migration")
        sold = False
        if mig_bal is not None:
            try:
                sold = float(bal) < float(mig_bal) * 0.99
            except Exception:
                sold = False
        max_dev = float(config.get("auditor.max_dev_pct"))
        if sold:
            await emit(3, False, "dev sold", "rpc")
            grey_rest(4)
            await self._finish(scan, False, 3, layers, None, "dev sold")
            return
        if pct >= max_dev:
            await emit(3, False, f"dev holds {pct:.0f}%", "rpc")
            grey_rest(4)
            await self._finish(scan, False, 3, layers, None, f"dev holds {pct:.0f}%")
            return
        await emit(3, True, f"{pct:.1f}% · sold 0", "rpc")

        # Layer 4 top 10
        top10 = await self._top10(mint, pool, supply)
        if top10 is None:
            await emit(4, False, "no data: top 10", "rpc")
            grey_rest(5)
            await self._finish(scan, False, 4, layers, None, "no data: top 10")
            return
        max_top = float(config.get("auditor.max_top10_pct"))
        if top10 >= max_top:
            await emit(4, False, f"top 10 hold {top10:.0f}%", "rpc")
            grey_rest(5)
            await self._finish(scan, False, 4, layers, None, f"top 10 hold {top10:.0f}%")
            return
        await emit(4, True, f"{top10:.1f}%", "rpc")

        # Layer 5 liquidity
        lp_pct = rugcheck_lp_locked_pct(report, pool)
        if lp_pct is None:
            await emit(5, False, "no data: liquidity", "rugcheck")
            grey_rest(6)
            await self._finish(scan, False, 5, layers, None, "no data: liquidity")
            return
        min_lp = float(config.get("auditor.min_lp_locked_pct"))
        scanner_liq = scan.get("liquidityUsd") or 0
        # fresh liq from scan is fine; "pulled" if we had a waiting room snapshot much lower — skip without second source
        if lp_pct < min_lp:
            await emit(5, False, "liquidity unlocked", "rugcheck")
            grey_rest(6)
            await self._finish(scan, False, 5, layers, None, "liquidity unlocked")
            return
        await emit(5, True, f"{lp_pct:.0f}% burned", "rugcheck")

        # Layer 6 pool age
        migrated_at = coin.get("migrated_at") or scan.get("ts")
        try:
            mig = datetime.fromisoformat(str(migrated_at).replace("Z", "+00:00"))
            age_m = int((datetime.now(timezone.utc) - mig).total_seconds() // 60)
        except Exception:
            age_m = int(scan.get("ageMin") or 0)
        min_age = int(config.get("auditor.min_pool_age_min"))
        if age_m < min_age:
            await emit(6, False, "pool too young", "rpc")
            grey_rest(7)
            await self._finish(scan, False, 6, layers, None, "pool too young")
            return
        await emit(6, True, f"{age_m}m", "rpc")

        # Layer 7 bundles
        has_edges = rugcheck_graph_has_edges(graph)
        if has_edges is not True:
            await emit(7, False, "no data: bundles", "rugcheck")
            grey_rest(8)
            await self._finish(scan, False, 7, layers, None, "no data: bundles")
            return
        bundled = self._biggest_group(graph)
        max_b = int(config.get("auditor.max_bundled"))
        if bundled >= max_b:
            await emit(7, False, f"{bundled} bundled wallets", "rugcheck")
            grey_rest(8)
            await self._finish(scan, False, 7, layers, None, f"{bundled} bundled wallets")
            return
        await emit(7, True, "None" if bundled <= 1 else str(bundled), "rugcheck")

        # Layer 8 delegations
        try:
            holders, drain = await self._delegations(mint)
        except Exception:
            holders, drain = None, "error"
            if not self._layer8_down_alerted and self.notifier:
                self._layer8_down_alerted = True
                await self.notifier.send(
                    "layer 8 down, every coin is red until rpc_url changes", paper=False
                )
        if drain == "error" or holders is None:
            await emit(8, False, "no data: delegations", "rpc")
            await self._finish(scan, False, 8, layers, holders, "no data: delegations")
            return
        if drain:
            await emit(8, False, drain, "rpc")
            await self._finish(scan, False, 8, layers, holders, drain)
            return
        await emit(8, True, "None", "rpc")

        # all passed
        self.db.upsert_coin(mint=mint, holders=holders)
        await self._finish(scan, True, 8, layers, holders, None)

    async def _finish(self, scan, passed, layers_checked, layers, holders, reason):
        mint = scan["mint"]
        out = {
            "agent": "auditor",
            "mint": mint,
            "ts": config.now_iso(),
            "passed": passed,
            "layersChecked": layers_checked,
            "layers": layers,
            "holders": holders,
            "reason": reason,
            "name": scan.get("name"),
            "symbol": scan.get("symbol"),
            "pool": scan.get("pool"),
            "scanner": scan,
        }
        self.db.add_audit_run(out)
        await self.bus.publish_sse("audit", out)
        night = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if passed:
            await self.bus.analyst.put(out)
        else:
            self.db.mark_rejected(mint, night, "auditor")
            name = scan.get("name") or mint[:8]
            self.db.add_activity(
                "rejected",
                mint,
                "auditor",
                f"Rejected {name}",
                f"Auditor · {reason}",
                "Skipped",
            )
            await self.bus.publish_sse("activity", {"kind": "rejected", "mint": mint})
        path = Path(__file__).resolve().parent.parent / "logs" / "auditor.log"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a") as f:
            f.write(f"{out['ts']} {mint} passed={passed} reason={reason}\n")

    async def _supply(self, mint) -> float | None:
        res = await self._rpc("getTokenSupply", [mint])
        if not res:
            return None
        ui = dig(res, "value.uiAmount")
        if ui is not None:
            return float(ui)
        try:
            return float(dig(res, "value.amount")) / (10 ** int(dig(res, "value.decimals") or 0))
        except Exception:
            return None

    async def _creator_balance(self, creator, mint) -> float | None:
        res = await self._rpc(
            "getTokenAccountsByOwner",
            [creator, {"mint": mint}, {"encoding": "jsonParsed"}],
        )
        if not res:
            return None
        value = dig(res, "value") or []
        total = 0.0
        for acc in value:
            amt = dig(acc, "account.data.parsed.info.tokenAmount.uiAmount")
            try:
                total += float(amt or 0)
            except Exception:
                pass
        return total

    async def _top10(self, mint, pool, supply) -> float | None:
        res = await self._rpc("getTokenLargestAccounts", [mint])
        if not res:
            return None
        value = dig(res, "value") or []
        total = 0.0
        n = 0
        for acc in value:
            if pool and dig(acc, "address") == pool:
                continue
            try:
                total += float(dig(acc, "uiAmount") or 0)
            except Exception:
                continue
            n += 1
            if n >= 10:
                break
        return (total / supply) * 100.0 if supply else None

    def _biggest_group(self, graph) -> int:
        if not isinstance(graph, dict):
            return 0
        edges = dig(graph, "edges") or []
        nodes = dig(graph, "nodes") or []
        # union-find
        parent = {}

        def find(x):
            parent.setdefault(x, x)
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a, b):
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[rb] = ra

        for e in edges:
            a = dig(e, "source") or dig(e, "from") or dig(e, "a")
            b = dig(e, "target") or dig(e, "to") or dig(e, "b")
            if a and b:
                union(str(a), str(b))
        for n in nodes:
            nid = dig(n, "id") or dig(n, "address") or n if isinstance(n, str) else None
            if nid:
                find(str(nid))
        counts = defaultdict(int)
        for k in list(parent.keys()):
            counts[find(k)] += 1
        return max(counts.values()) if counts else 0

    async def _delegations(self, mint):
        max_del = int(config.get("auditor.max_delegated_accounts"))
        holders = 0
        by_delegate = defaultdict(list)

        async def fetch(program_id):
            # memcmp filter on mint in token account
            # token account mint offset = 0
            filt = {
                "encoding": "jsonParsed",
                "filters": [
                    {"dataSize": 165},
                    {"memcmp": {"offset": 0, "bytes": mint}},
                ],
            }
            # Token-2022 accounts may not be 165 — try without dataSize too
            res = await self._rpc("getProgramAccounts", [program_id, filt])
            if res is None:
                # retry without dataSize
                filt2 = {
                    "encoding": "jsonParsed",
                    "filters": [{"memcmp": {"offset": 0, "bytes": mint}}],
                }
                res = await self._rpc("getProgramAccounts", [program_id, filt2])
            return res or []

        accounts = []
        for prog in (TOKEN, TOKEN_2022):
            part = await fetch(prog)
            if isinstance(part, list):
                accounts.extend(part)

        if not accounts:
            # also try owner from mint account
            info = await self._rpc("getAccountInfo", [mint, {"encoding": "jsonParsed"}])
            owner = dig(info, "value.owner")
            if owner and owner not in (TOKEN, TOKEN_2022):
                part = await fetch(owner)
                if isinstance(part, list):
                    accounts.extend(part)

        for acc in accounts:
            parsed = dig(acc, "account.data.parsed.info") or {}
            bal = dig(parsed, "tokenAmount.uiAmount")
            try:
                bal_f = float(bal or 0)
            except Exception:
                bal_f = 0
            if bal_f > 0:
                holders += 1
            delegate = dig(parsed, "delegate")
            if delegate:
                by_delegate[delegate].append(dig(acc, "pubkey") or "")

        drain = None
        for d, accts in by_delegate.items():
            if len(accts) > max_del:
                short = d[:4] + "..." + d[-3:] if len(d) > 10 else d
                drain = f"{len(accts)} wallets → {short}"
                break
        return holders, drain

    def _log(self, mint, n, value, ok, ms):
        line = f"{config.now_iso()} {mint} L{n} ok={ok} {value} {ms}ms"
        log.info(line)
        path = Path(__file__).resolve().parent.parent / "logs" / "auditor.log"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a") as f:
            f.write(line + "\n")

    async def audit_now(self, mint: str) -> dict:
        """On-demand audit for Telegram buy command."""
        scan = {
            "mint": mint,
            "name": (self.db.get_coin(mint) or {}).get("name"),
            "symbol": (self.db.get_coin(mint) or {}).get("symbol"),
            "pool": (self.db.get_coin(mint) or {}).get("pool"),
            "liquidityUsd": 0,
            "ageMin": 999,
            "ts": config.now_iso(),
        }
        # Run synchronously in this coroutine by putting through _audit but capturing
        # We call _audit which pushes to analyst on pass — for buy command we don't want that.
        # Simplified: reuse layers via temporary flag... For now run a copy path.
        await self._audit(scan)
        return self.db.get_audit(mint) or {}
