"""FastAPI JSON + SSE. Owner wallet session only. Shared bearers are rejected."""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import config
import health as healthmod
import session as sessionmod
import simpreview
from links import SIGNUP_URL, coin_url, profile_url
from metrics import METRICS

WEB = Path(__file__).resolve().parents[1] / "desk"


def _secure_cookie() -> bool:
    return os.environ.get("SESSION_SECURE", "1") != "0"


class RateLimiter:
    def __init__(self, limit: int = 30, window: float = 60.0):
        self.limit = limit
        self.window = window
        self.hits: dict[str, list[float]] = {}

    def allow(self, key: str) -> bool:
        now = time.time()
        bucket = [stamp for stamp in self.hits.get(key, []) if now - stamp < self.window]
        if len(bucket) >= self.limit:
            self.hits[key] = bucket
            return False
        bucket.append(now)
        self.hits[key] = bucket
        return True


_limiter = RateLimiter()
_MINT = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")


class SettingsBody(BaseModel):
    settings: dict[str, Any]


class ModeBody(BaseModel):
    mode: str
    confirm: str | None = None


class PushBody(BaseModel):
    endpoint: str
    keys: dict[str, str]


class PreviewBody(BaseModel):
    cluster: str
    mint: str
    name: str
    symbol: str
    decimals: int
    side: str
    amount_base: int
    destination: str
    max_lamports_in: int
    min_amount_out: int
    slippage_bps: int
    fee_lamports_ceiling: int


class VerifyBody(BaseModel):
    public_key_hex: str
    signature_hex: str
    message_sha256: str


class NonceBody(BaseModel):
    wallet: str
    cluster: str


class LoginBody(BaseModel):
    wallet: str
    cluster: str
    nonce: str
    public_key_hex: str
    signature_hex: str


def create_app(db, bus, desk=None) -> FastAPI:
    app = FastAPI(title="Pump Desk")

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = "default-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    app.state.db = db
    app.state.bus = bus
    app.state.desk = desk
    app.state.sim = simpreview.SimStore()

    def require_owner(
        request: Request,
        t: str | None = Query(default=None),
        x_app_token: str | None = Header(default=None, alias="X-App-Token"),
        authorization: str | None = Header(default=None),
    ):
        if t or x_app_token or authorization:
            raise HTTPException(status_code=401, detail="shared bearer and query token are not accepted")
        _origin_ok(request)
        row = _owner_row(request)
        if not row:
            raise HTTPException(status_code=401, detail="owner session required")
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            if request.headers.get("x-requested-with") != "pumpdesk":
                raise HTTPException(status_code=403, detail="missing X-Requested-With")
            if request.headers.get("x-csrf-token") != row.get("csrf"):
                raise HTTPException(status_code=403, detail="csrf")
        return row

    auth = Depends(require_owner)

    @app.get("/api/state")
    async def state(_: None = auth):
        bal = db.latest_balance()
        if bal is None:
            bal = float(config.get("desk.paper_start_stack"))
        start = float(config.get("desk.paper_start_stack"))
        # today % from first balance of calendar day
        rows = db.balances()
        today_start = start
        if rows:
            today_start = float(rows[0]["value"])
        pct = ((bal / today_start) - 1) * 100 if today_start else 0
        mult = bal / today_start if today_start else 1
        mode = config.get("desk.mode")
        cards = _agent_cards(db)
        return {
            "balance": round(bal, 2),
            "todayPct": round(pct, 2),
            "multiplier": round(mult, 2),
            "mode": mode,
            "agents": cards,
            "paused": config.paused_agents(),
            "ts": config.now_iso(),
        }

    @app.get("/api/chart")
    async def chart(range: str = "LIVE", _: None = auth):
        since = _range_since(range)
        points = db.balances(since=since)
        marks = []
        for a in db.activity(limit=50):
            if a["kind"] in ("bought", "sold", "stopped"):
                marks.append(
                    {
                        "ts": a["ts"],
                        "kind": a["kind"],
                        "label": a["title"],
                        "value": a["value"],
                        "mint": a["mint"],
                    }
                )
        return {
            "range": range,
            "points": [{"ts": p["ts"], "value": p["value"]} for p in points],
            "marks": marks,
        }

    @app.get("/api/activity")
    async def activity(before: int | None = None, _: None = auth):
        rows = db.activity(before_id=before, limit=30)
        out = []
        for r in rows:
            out.append(
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
            )
        return {"rows": out}

    @app.get("/api/coin/{mint}")
    async def coin(mint: str, _: None = auth):
        if not _MINT.match(mint):
            raise HTTPException(status_code=400, detail="bad mint")
        c = db.get_coin(mint) or {"mint": mint}
        prices = db.prices(mint)
        candles = _ohlc(prices)
        pos = db.get_position(mint)
        audit = db.get_audit(mint)
        exit_line = None
        if pos:
            if pos.get("trail_active"):
                exit_line = float(pos["peak_price"]) * (
                    1 - float(pos.get("trail_pct") or config.get("risk.trail_pct")) / 100
                )
            else:
                exit_line = float(pos.get("stop_price") or 0)
        last = prices[-1] if prices else None
        return {
            "mint": mint,
            "name": c.get("name"),
            "symbol": c.get("symbol"),
            "pool": c.get("pool"),
            "price": last["price"] if last else None,
            "candles": candles,
            "holders": c.get("holders"),
            "position": pos,
            "exitLine": exit_line,
            "auditLayers": (audit or {}).get("layers"),
            "coin_url": coin_url(mint, "solana"),
            "migrated_at": c.get("migrated_at"),
        }

    @app.get("/api/audit/{mint}")
    async def audit(mint: str, _: None = auth):
        a = db.get_audit(mint)
        if not a:
            return {"mint": mint, "layers": [], "passed": None}
        return a

    @app.get("/api/agents/{name}/decisions")
    async def decisions(name: str, _: None = auth):
        name = name.lower()
        if name == "scanner":
            rows = db.recent_scans(20)
        elif name == "auditor":
            rows = db.recent_audits(20)
        elif name == "analyst":
            rows = db.recent_verdicts(20)
        elif name == "executor":
            rows = db.recent_signals(20)
        elif name == "risk":
            rows = [
                dict(p)
                for p in db.open_positions()
            ]
            with db.cursor() as cur:
                cur.execute(
                    "SELECT * FROM positions WHERE status='closed' ORDER BY id DESC LIMIT 20"
                )
                rows = [dict(r) for r in cur.fetchall()] + rows
        else:
            rows = []
        # attach coin_url where mint present
        for r in rows:
            if isinstance(r, dict) and r.get("mint"):
                r["coin_url"] = coin_url(r["mint"])
        return {"agent": name, "decisions": rows[:20]}

    @app.get("/api/account")
    async def account(_: None = auth):
        handle = config.get("desk.pump_handle") or ""
        return {
            "mode": config.get("desk.mode"),
            "stack": config.current_stack(),
            "paper_start_stack": config.get("desk.paper_start_stack"),
            "live_stack": config.get("desk.live_stack"),
            "profile_url": profile_url(handle),
            "pump_handle": handle,
            "signup_url": SIGNUP_URL,
            "invite_url": SIGNUP_URL,
            "telegram": bool(os.environ.get("TG_TOKEN")),
            "owner": config.get("desk.owner_telegram_username"),
            "vapid_public_key": os.environ.get("VAPID_PUBLIC_KEY", ""),
            "ticket": config.ticket_check(),
            "has_full_paper_night": db.has_full_paper_night(),
        }

    @app.get("/api/settings")
    async def get_settings(_: None = auth):
        s = config.all_settings()
        # strip internal
        return {k: v for k, v in s.items() if not k.startswith("desk._")}

    @app.post("/api/settings")
    async def post_settings(body: SettingsBody, _: None = auth):
        results = {}
        for k, v in body.settings.items():
            ok, msg = config.set_setting(k, v, who="app", db=db)
            results[k] = {"ok": ok, "msg": msg}
        return {"results": results, "ticket": config.ticket_check()}

    @app.post("/api/agents/{name}/pause")
    async def pause(name: str, _: None = auth):
        if name.lower() == "risk" and db.open_positions():
            raise HTTPException(400, "Can't pause Risk while a position is open")
        config.pause(name)
        return {"paused": True, "agent": name}

    @app.post("/api/agents/{name}/resume")
    async def resume(name: str, _: None = auth):
        config.resume(name)
        return {"paused": False, "agent": name}

    @app.post("/api/mode")
    async def mode(body: ModeBody, _: None = auth):
        m = body.mode.upper()
        if m == "LIVE":
            raise HTTPException(403, "LIVE is unavailable. Mainnet sending cannot be enabled.")
        ok, msg = config.set_setting("desk.mode", m, who="app", db=db)
        if not ok:
            raise HTTPException(400, msg)
        return {"mode": m, "msg": msg}

    @app.post("/api/push")
    async def push_sub(body: PushBody, _: None = auth):
        db.save_push_sub(body.endpoint, body.keys.get("p256dh", ""), body.keys.get("auth", ""))
        return {"ok": True}

    @app.get("/api/stream")
    async def stream(_: None = auth):
        q = await bus.subscribe_sse()

        async def gen():
            try:
                yield "event: hello\ndata: {}\n\n"
                while True:
                    try:
                        item = await asyncio.wait_for(q.get(), timeout=25)
                        yield f"event: {item['event']}\ndata: {json.dumps(item['data'], default=str)}\n\n"
                    except asyncio.TimeoutError:
                        yield "event: ping\ndata: {}\n\n"
            finally:
                await bus.unsubscribe_sse(q)

        return StreamingResponse(gen(), media_type="text/event-stream")

    @app.post("/api/test-push")
    async def test_push(_: None = auth):
        desk = app.state.desk
        if desk and desk.notifier:
            await desk.notifier.send(
                "Desk test push from app",
                mint=None,
                buttons=[{"kind": "url", "text": "Open Pump.fun", "url": SIGNUP_URL}],
            )
            return {"ok": True}
        return {"ok": False}

    @app.get("/d/")
    async def planb_root():
        raise HTTPException(status_code=404, detail="not found")

    @app.get("/d/{maybe}")
    async def planb_wrong(maybe: str):
        import os
        # Exact DATA_PATH without a file = no directory listing. Wrong path = 404.
        # Files under /d/{DATA_PATH}/... are served by the StaticFiles mount.
        raise HTTPException(status_code=404, detail="not found")

    # static
    if WEB.exists():

        # Plan B files stay on local disk. They are not mounted without auth.
        app.mount("/assets", StaticFiles(directory=WEB), name="assets")

        @app.get("/")
        async def index():
            return FileResponse(WEB / "index.html")

        @app.get("/manifest.json")
        async def manifest():
            return FileResponse(WEB / "manifest.json")

        @app.get("/sw.js")
        async def sw():
            return FileResponse(WEB / "sw.js")

        @app.get("/app.css")
        async def css():
            return FileResponse(WEB / "app.css")

        @app.get("/app.js")
        async def js():
            return FileResponse(WEB / "app.js")

        @app.get("/chart.js")
        async def chartjs():
            return FileResponse(WEB / "chart.js")

        @app.get("/icons/{name}")
        async def icon(name: str):
            p = WEB / "icons" / name
            if not p.exists():
                raise HTTPException(404)
            return FileResponse(p)

    @app.get("/health/live")
    async def health_live():
        return {"status": "live"}

    @app.get("/health/ready")
    async def health_ready():
        try:
            ok = db.ping()
        except Exception:
            raise HTTPException(status_code=503, detail="db")
        if not ok:
            raise HTTPException(status_code=503, detail="db")
        return {
            "status": "ready",
            "db_readable": True,
            "db_writes_on_this_request": False,
            "db_writes_at_open": True,
        }

    @app.get("/health")
    async def health_detail(_: None = auth):
        desk_obj = app.state.desk
        return healthmod.build_health(
            db,
            bus,
            telegram=getattr(desk_obj, "telegram", None),
            scanner=getattr(desk_obj, "scanner", None),
        )

    @app.get("/metrics")
    async def metrics_route(_: None = auth):
        snap = METRICS.snapshot()
        for queue in bus.queue_stats():
            snap[f"queue_depth_{queue['name']}"] = int(queue["depth"])
            snap[f"queue_dropped_{queue['name']}"] = int(queue["dropped"])
        snap["broadcast_enabled"] = 0
        return snap

    def _origin_ok(request: Request) -> None:
        origin = request.headers.get("origin")
        host = request.headers.get("host")
        if not origin or not host:
            return
        from urllib.parse import urlparse
        if urlparse(origin).netloc != host:
            raise HTTPException(status_code=403, detail="origin mismatch")

    def _require_custom_header(request: Request) -> None:
        if request.headers.get("x-requested-with") != "pumpdesk":
            raise HTTPException(status_code=403, detail="missing X-Requested-With")

    def _owner_row(request: Request) -> dict | None:
        raw = request.cookies.get("desk_session")
        row = sessionmod.session_from_cookie(db, raw)
        if not row:
            return None
        owner = os.environ.get("DESK_OWNER_WALLET", "").strip()
        if not owner or row.get("wallet") != owner:
            db.delete_session(hashlib.sha256((raw or "").encode()).hexdigest())
            return None
        return row

    def _session(request: Request) -> dict:
        _origin_ok(request)
        row = _owner_row(request)
        if not row:
            raise HTTPException(status_code=401, detail="owner session required")
        return row

    def _csrf(request: Request, sess: dict) -> None:
        _require_custom_header(request)
        if request.headers.get("x-csrf-token") != sess.get("csrf"):
            raise HTTPException(status_code=403, detail="csrf")

    @app.post("/api/session/nonce")
    async def session_nonce(body: NonceBody, request: Request):
        _origin_ok(request)
        _require_custom_header(request)
        if not _limiter.allow(request.client.host if request.client else "local"):
            raise HTTPException(status_code=429, detail="rate limit")
        domain = request.headers.get("host") or "localhost"
        try:
            issued = sessionmod.issue_nonce(db, body.wallet, body.cluster, domain)
        except sessionmod.SessionError as exc:
            raise HTTPException(status_code=400, detail={"code": exc.code, "message": exc.message})
        csrf = secrets.token_urlsafe(16)
        response = JSONResponse(issued)
        response.set_cookie("desk_csrf", csrf, httponly=False, samesite="strict", secure=_secure_cookie(), path="/")
        return response

    @app.post("/api/session/verify")
    async def session_verify(body: LoginBody, request: Request):
        _origin_ok(request)
        _require_custom_header(request)
        if request.headers.get("x-csrf-token") != request.cookies.get("desk_csrf"):
            raise HTTPException(status_code=403, detail="csrf")
        domain = request.headers.get("host") or "localhost"
        try:
            public_key = bytes.fromhex(body.public_key_hex)
            signature = bytes.fromhex(body.signature_hex)
            issued = sessionmod.verify_login(
                db, body.wallet, body.cluster, body.nonce, signature, public_key, domain
            )
        except sessionmod.SessionError as exc:
            raise HTTPException(status_code=400, detail={"code": exc.code, "message": exc.message})
        except ValueError:
            raise HTTPException(status_code=400, detail={"code": "schema", "message": "hex required"})
        response = JSONResponse({"wallet": issued["wallet"], "cluster": issued["cluster"], "expires_at": issued["expires_at"]})
        response.set_cookie(
            "desk_session", issued["session_id"], httponly=True, samesite="strict",
            secure=_secure_cookie(), path="/",
        )
        response.set_cookie(
            "desk_csrf", issued["csrf"], httponly=False, samesite="strict", secure=_secure_cookie(), path="/",
        )
        return response

    @app.get("/api/session")
    async def session_status(request: Request):
        raw = request.cookies.get("desk_session")
        row = _owner_row(request)
        if not row:
            response = JSONResponse({"connected": False, "wallet": None, "cluster": None})
            if raw:
                response.delete_cookie("desk_session", path="/")
            return response
        return {"connected": True, "wallet": row["wallet"], "cluster": row["cluster"]}

    @app.post("/api/session/logout")
    async def session_logout(request: Request):
        row = sessionmod.session_from_cookie(db, request.cookies.get("desk_session"))
        if row:
            _csrf(request, row)
            db.delete_session(hashlib.sha256(request.cookies.get("desk_session", "").encode()).hexdigest())
        response = JSONResponse({"connected": False})
        response.delete_cookie("desk_session", path="/")
        return response

    @app.get("/api/intents")
    async def intents(request: Request):
        sess = _session(request)
        return {"rows": db.list_intents(sess["wallet"]), "executable": False, "banner": simpreview.BANNER}

    @app.post("/api/sim/preview")
    async def sim_preview(body: PreviewBody, request: Request):
        sess = _session(request)
        _csrf(request, sess)
        if config.get("desk.emergency_stop"):
            raise HTTPException(status_code=400, detail={"code": "stopped", "message": "emergency stop is on"})
        if body.cluster != sess["cluster"]:
            raise HTTPException(status_code=400, detail={"code": "cluster", "message": "cluster does not match the wallet session"})
        projected = db.open_lamports_for_wallet(sess["wallet"]) + int(body.max_lamports_in) + int(body.fee_lamports_ceiling)
        if projected > simpreview.SIM_MAX_LAMPORTS:
            raise HTTPException(status_code=400, detail={"code": "limit", "message": "concurrent lamport cap"})
        key = request.headers.get("idempotency-key")
        try:
            row = simpreview.create_preview(app.state.sim, body.model_dump(), key)
        except simpreview.SimError as exc:
            raise HTTPException(status_code=400, detail={"code": exc.code, "message": exc.message})
        row["wallet"] = sess["wallet"]
        db.save_intent(row)
        METRICS.inc("sim_preview_created")
        return row

    @app.get("/api/sim/preview/{preview_id}")
    async def sim_preview_get(preview_id: str, request: Request):
        _session(request)
        try:
            return simpreview.get_preview(app.state.sim, preview_id)
        except simpreview.SimError as exc:
            status = 410 if exc.code == "expired" else 404
            raise HTTPException(status_code=status, detail={"code": exc.code, "message": exc.message})

    @app.post("/api/sim/preview/{preview_id}/verify")
    async def sim_preview_verify(preview_id: str, body: VerifyBody, request: Request):
        sess = _session(request)
        _csrf(request, sess)
        if config.get("desk.emergency_stop"):
            raise HTTPException(status_code=400, detail={"code": "stopped", "message": "emergency stop is on"})
        try:
            public_key = bytes.fromhex(body.public_key_hex)
            signature = bytes.fromhex(body.signature_hex)
        except ValueError:
            raise HTTPException(status_code=400, detail={"code": "schema", "message": "hex required"})
        try:
            result = simpreview.verify_preview(
                app.state.sim, preview_id, public_key, signature, body.message_sha256
            )
        except simpreview.SimError as exc:
            METRICS.inc("sim_verify_rejected")
            code = 409 if exc.code in ("replay", "idempotency") else 400
            raise HTTPException(status_code=code, detail={"code": exc.code, "message": exc.message})
        stored = app.state.sim.rows.get(preview_id) or {}
        stored["wallet"] = sess["wallet"]
        stored["signature_hex"] = body.signature_hex
        stored["status"] = "verified"
        db.save_intent(stored)
        result["solana_transaction"] = False
        result["note"] = "This verifies a simulated intent message. It is not a Solana transaction and it is not a fill."
        return result

    @app.post("/api/sim/stop")
    async def sim_stop(request: Request):
        sess = _session(request)
        _csrf(request, sess)
        app.state.sim.stop()
        config.set_setting("desk.emergency_stop", True, who="wallet-session", db=db)
        return {"stopped": True, "broadcast_enabled": False, "note": "A stop cannot undo a transaction that was already broadcast. This process has no broadcast path."}

    @app.post("/api/chain/interpret")
    async def chain_interpret(request: Request):
        """Test helper: interpret a caller-supplied fixture. It does not query a cluster."""
        sess = _session(request)
        _csrf(request, sess)
        payload = await request.json()
        from chaincheck import evaluate_fill
        result = evaluate_fill(payload.get("status"), payload.get("transaction"), payload.get("expected") or {})
        result["queried_network"] = False
        return result

    return app


def _range_since(range_: str) -> str | None:
    now = datetime.now(timezone.utc)
    mapping = {
        "LIVE": timedelta(hours=1),
        "1H": timedelta(hours=1),
        "4H": timedelta(hours=4),
        "1D": timedelta(days=1),
        "1W": timedelta(weeks=1),
        "ALL": None,
    }
    delta = mapping.get(range_.upper())
    if delta is None and range_.upper() == "ALL":
        return None
    if delta is None:
        delta = timedelta(hours=1)
    return (now - delta).strftime("%Y-%m-%dT%H:%M:%SZ")


def _ohlc(prices: list[dict]) -> list[dict]:
    buckets: dict[str, dict] = {}
    for p in prices:
        ts = p["ts"][:16]  # minute
        price = float(p["price"])
        vol = p.get("volume_m5")
        b = buckets.get(ts)
        if not b:
            buckets[ts] = {
                "ts": ts,
                "o": price,
                "h": price,
                "l": price,
                "c": price,
                "v": float(vol or 0),
            }
        else:
            b["h"] = max(b["h"], price)
            b["l"] = min(b["l"], price)
            b["c"] = price
            if vol is not None:
                b["v"] = float(vol)
    return [buckets[k] for k in sorted(buckets)]


def _agent_cards(db) -> list[dict]:
    return [
        {
            "name": "scanner",
            "title": "Scanner",
            "color": "#64d2ff",
            "count": db.count_today("scans"),
            "paused": config.is_paused("scanner"),
            "status": "Listening for graduations",
        },
        {
            "name": "auditor",
            "title": "Auditor",
            "color": "#fff",
            "count": db.count_today("audit_runs"),
            "paused": config.is_paused("auditor"),
            "status": "Ready",
        },
        {
            "name": "analyst",
            "title": "Analyst",
            "color": "#ffd60a",
            "count": db.count_today("verdicts"),
            "paused": config.is_paused("analyst"),
            "status": "Scoring (rules)",
        },
        {
            "name": "executor",
            "title": "Executor",
            "color": "#00d35a",
            "count": db.count_today("signals"),
            "paused": config.is_paused("executor"),
            "status": "Ready",
        },
        {
            "name": "risk",
            "title": "Risk",
            "color": "#ff6b9a",
            "count": len(db.open_positions()),
            "paused": config.is_paused("risk"),
            "status": "Guarding" if db.open_positions() else "Idle",
            "stop_pct": config.get("risk.stop_pct"),
            "trail_pct": config.get("risk.trail_pct"),
        },
    ]
